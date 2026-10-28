// Vercel 서버리스 함수: Claude 가 find_spots / get_weather 를 스스로 골라 호출하는 에이전트.
// API Key 는 환경변수(ANTHROPIC_API_KEY)에서만 읽는다.
const { tools, handlers } = require('./tools.js');

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5';
const MAX_STEPS = 5;

const SYSTEM =
  '너는 제주 여행 추천 도우미다. 사용자 요청에 맞는 장소는 반드시 find_spots 도구로 찾고, ' +
  '날씨가 중요한 요청이면 get_weather 로 현재 날씨를 먼저 확인한다. ' +
  '비가 오면 실내(indoor=true), 아니면 야외 위주로 추천한다. ' +
  '지역(동쪽, 서쪽, 서귀포, 제주시)을 말하지 않았으면 하나를 골라 그렇게 했다고 알려 준다. ' +
  '도구 결과에 있는 장소만 추천하고 목록 밖 장소는 지어내지 않는다. 결과가 비면 없다고 답한다. 한국어로 짧게 답한다.';

const callClaude = async (key, messages) => {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({ model: MODEL, max_tokens: 1024, system: SYSTEM, tools, messages }),
  });
  if (!r.ok) {
    const detail = await r.json().catch(() => ({}));
    throw new Error('Claude 오류 (' + r.status + ') ' + ((detail.error && detail.error.message) || '') + ' [model: ' + MODEL + ']');
  }
  return r.json();
};

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY 환경변수가 설정되지 않았습니다.' });
  }

  const message = String((req.body && req.body.message) || '').trim().slice(0, 300);
  if (!message) {
    return res.status(400).json({ error: '메시지를 입력해 주세요.' });
  }

  const messages = [{ role: 'user', content: message }];
  const calls = []; // 화면에 보여줄 도구 호출 기록
  let spots = [];

  try {
    for (let step = 0; step < MAX_STEPS; step++) {
      const data = await callClaude(key, messages);

      const uses = data.content.filter((b) => b.type === 'tool_use');
      if (data.stop_reason !== 'tool_use' || !uses.length) {
        const reply = data.content.filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
        return res.status(200).json({ reply, calls, spots });
      }

      // 모델이 요청한 도구를 실행하고 결과를 돌려준다
      messages.push({ role: 'assistant', content: data.content });
      const results = [];
      for (const use of uses) {
        const handler = handlers[use.name];
        const result = handler ? await handler(use.input || {}) : { error: '알 수 없는 도구' };
        calls.push({ name: use.name, args: use.input || {} });
        if (use.name === 'find_spots' && result.spots) spots = result.spots;
        results.push({ type: 'tool_result', tool_use_id: use.id, content: JSON.stringify(result) });
      }
      messages.push({ role: 'user', content: results });
    }
    return res.status(200).json({ reply: '도구 호출이 너무 길어져 멈췄습니다. 질문을 더 구체적으로 해 주세요.', calls, spots });
  } catch (err) {
    return res.status(502).json({ error: String(err.message || err) });
  }
};
