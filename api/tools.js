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

module.exports = { find_spots, find_spots_tool, tools: [find_spots_tool] };
