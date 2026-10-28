// Vercel 서버리스 함수: Gemini 가 find_spots / get_weather 를 스스로 골라 호출하는 에이전트.
// API Key 는 환경변수(GEMINI_API_KEY)에서만 읽는다.
const { tools, handlers } = require('./tools.js');

const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const MAX_STEPS = 5;

const SYSTEM =
  '너는 제주 여행 추천 도우미다. 사용자 요청에 맞는 장소는 반드시 find_spots 도구로 찾고, ' +
  '날씨가 중요한 요청이면 get_weather 로 현재 날씨를 먼저 확인한다. ' +
  '비가 오면 실내(indoor=true), 아니면 야외 위주로 추천한다. ' +
  '지역(동쪽, 서쪽, 서귀포, 제주시)을 말하지 않았으면 하나를 골라 그렇게 했다고 알려 준다. ' +
  '도구 결과에 있는 장소만 추천하고 목록 밖 장소는 지어내지 않는다. 결과가 비면 없다고 답한다. 한국어로 짧게 답한다.';

// tools.js 의 Claude 형식(input_schema)을 Gemini 형식(parameters)으로 바꾼다
const functionDeclarations = tools.map((t) => ({
  name: t.name,
  description: t.description,
  parameters: t.input_schema,
}));

const callGemini = async (key, contents) => {
  const r = await fetch(
    'https://generativelanguage.googleapis.com/v1beta/models/' + MODEL + ':generateContent',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM }] },
        contents,
        tools: [{ functionDeclarations }],
      }),
    }
  );
  if (!r.ok) throw new Error('Gemini 오류 (' + r.status + ')');
  return r.json();
};

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    return res.status(500).json({ error: 'GEMINI_API_KEY 환경변수가 설정되지 않았습니다.' });
  }

  const message = String((req.body && req.body.message) || '').trim().slice(0, 300);
  if (!message) {
    return res.status(400).json({ error: '메시지를 입력해 주세요.' });
  }

  const contents = [{ role: 'user', parts: [{ text: message }] }];
  const calls = []; // 화면에 보여줄 도구 호출 기록
  let spots = [];

  try {
    for (let step = 0; step < MAX_STEPS; step++) {
      const data = await callGemini(key, contents);
      const content = data.candidates && data.candidates[0] && data.candidates[0].content;
      if (!content || !content.parts) {
        return res.status(502).json({ error: 'Gemini 가 답을 주지 않았습니다.' });
      }

      const fcs = content.parts.filter((p) => p.functionCall);
      if (!fcs.length) {
        const reply = content.parts.map((p) => p.text || '').join('').trim();
        return res.status(200).json({ reply, calls, spots });
      }

      // 모델이 요청한 도구를 실행하고 결과를 돌려준다
      contents.push(content);
      const responses = [];
      for (const { functionCall } of fcs) {
        const handler = handlers[functionCall.name];
        const result = handler ? await handler(functionCall.args || {}) : { error: '알 수 없는 도구' };
        calls.push({ name: functionCall.name, args: functionCall.args || {} });
        if (functionCall.name === 'find_spots' && result.spots) spots = result.spots;
        responses.push({ functionResponse: { name: functionCall.name, response: { result } } });
      }
      contents.push({ role: 'user', parts: responses });
    }
    return res.status(200).json({ reply: '도구 호출이 너무 길어져 멈췄습니다. 질문을 더 구체적으로 해 주세요.', calls, spots });
  } catch (err) {
    return res.status(502).json({ error: String(err.message || err) });
  }
};
