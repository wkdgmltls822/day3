// Claude 도구: find_spots — jeju_spots.json 목록에서만 관광지를 골라 돌려준다.
const { spots } = require('../jeju_spots.json');

const AREAS = ['동쪽', '서쪽', '서귀포', '제주시'];
const MAX_RESULTS = 8;

// 입력: { area: '동쪽'|'서쪽'|'서귀포'|'제주시', indoor?: true|false }
// 출력: 최대 8곳의 { name, area, indoor, description } (좌표는 화면용이라 뺌)
const find_spots = ({ area, indoor } = {}) => {
  if (!AREAS.includes(area)) {
    return { error: 'area 는 ' + AREAS.join(', ') + ' 중 하나여야 합니다.' };
  }
  const wantIndoor = indoor === undefined || indoor === null ? null : indoor === true || indoor === 'true';

  const result = spots
    // 목록의 지역은 '동쪽(성산)' 처럼 괄호가 붙기도 해서 앞부분으로 비교한다.
    .filter((s) => s.area.split('(')[0] === area)
    .filter((s) => wantIndoor === null || s.indoor === wantIndoor)
    .slice(0, MAX_RESULTS)
    .map((s) => ({
      name: s.name,
      area: s.area,
      indoor: s.indoor,
      description: s.desc || s.type,
    }));

  return { count: result.length, spots: result };
};

// Claude 에 넘기는 도구 설명
const find_spots_tool = {
  name: 'find_spots',
  description:
    '제주 관광지 목록(jeju_spots.json)에서 지역과 실내/야외 조건에 맞는 장소를 최대 8곳 찾아 ' +
    '이름, 지역, 실내여부, 설명을 돌려준다. 목록 밖 장소는 없다. ' +
    '결과에 없는 장소는 추천하거나 지어내지 말고, 결과가 비면 조건에 맞는 곳이 목록에 없다고 답한다.',
  input_schema: {
    type: 'object',
    properties: {
      area: {
        type: 'string',
        enum: AREAS,
        description: '찾을 지역: 동쪽, 서쪽, 서귀포, 제주시 중 하나',
      },
      indoor: {
        type: 'boolean',
        description: 'true 면 실내만, false 면 야외만. 생략하면 둘 다.',
      },
    },
    required: ['area'],
  },
};

// 지역 중심 좌표 (jeju_spots.json 에는 좌표가 없어서 날씨 조회용으로 쓴다)
const CENTER = { 동쪽: [33.46, 126.88], 서쪽: [33.36, 126.3], 서귀포: [33.25, 126.56], 제주시: [33.51, 126.52] };

// Open-Meteo(키 없음) 현재 날씨. weather_code 51 이상이면 비/눈/소나기/뇌우
const get_weather = async ({ area } = {}) => {
  if (!CENTER[area]) {
    return { error: 'area 는 ' + AREAS.join(', ') + ' 중 하나여야 합니다.' };
  }
  const [lat, lon] = CENTER[area];
  const url =
    'https://api.open-meteo.com/v1/forecast?latitude=' + lat + '&longitude=' + lon +
    '&current=temperature_2m,precipitation,weather_code,wind_speed_10m&timezone=Asia%2FSeoul';
  try {
    const r = await fetch(url);
    if (!r.ok) return { error: 'Open-Meteo 오류 (' + r.status + ')' };
    const c = (await r.json()).current;
    return {
      area,
      temperature_c: c.temperature_2m,
      wind_kmh: c.wind_speed_10m,
      precipitation_mm: c.precipitation,
      raining: c.weather_code >= 51,
    };
  } catch (err) {
    return { error: '날씨를 불러오지 못했습니다.' };
  }
};

const get_weather_tool = {
  name: 'get_weather',
  description:
    '제주 지역(동쪽, 서쪽, 서귀포, 제주시)의 현재 날씨(기온, 바람, 강수, 비 여부)를 Open-Meteo 에서 가져온다. ' +
    '비가 오는지(raining)에 따라 실내/야외 추천을 정할 때 쓴다.',
  input_schema: {
    type: 'object',
    properties: {
      area: { type: 'string', enum: AREAS, description: '날씨를 볼 지역: 동쪽, 서쪽, 서귀포, 제주시 중 하나' },
    },
    required: ['area'],
  },
};

const tools = [find_spots_tool, get_weather_tool];
const handlers = { find_spots, get_weather };

module.exports = { find_spots, find_spots_tool, get_weather, get_weather_tool, tools, handlers };
