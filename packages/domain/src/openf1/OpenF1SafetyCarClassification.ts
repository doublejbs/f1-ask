import { SessionStatus } from "../SessionStatus";

// race_control 의 category=SafetyCar 메시지에서 "지금 트랙이 어떤 중립화 상태인가" 를 판정한다.
//
// 왜 한 곳에 모았나:
//   이 판정은 원래 이벤트 스트림(OpenF1RaceControlEvents)과 세션 상태(deriveOpenF1Status)에
//   따로 구현돼 있었다. 그 결과 이벤트 쪽만 "VSC" 약어를 인식하고 세션 상태 쪽은 놓쳐서,
//   실데이터의 'VSC DEPLOYED' 가 화면 상단에 "세이프티 카"(풀 SC)로 표시되는 버그가 생겼다.
//   같은 판정을 두 벌 두면 반드시 다시 갈라지므로, 문구 해석은 이 파일에만 존재한다.
//   호출부는 결과를 자기 표현(RaceEventType / SessionStatus)으로 옮기기만 한다.
//
// 반환 타입으로 SessionStatus 를 재사용하는 이유:
//   필요한 구분이 "풀 SC / VSC / 해제" 셋뿐이고 SessionStatus 에 그대로 대응하는 값이
//   이미 있다. 새 enum 을 만들면 두 enum 사이 매핑이 또 하나의 갈라질 지점이 된다.

// 실데이터(2026 벨기에 GP)의 문구:
//   'SAFETY CAR DEPLOYED' / 'SAFETY CAR IN THIS LAP' / 'VSC DEPLOYED' / 'VSC ENDING'
// FIA 는 풀 표기('VIRTUAL SAFETY CAR')와 약어('VSC')를 섞어 쓰므로 둘 다 본다.
const VIRTUAL_TEXTS = ["VIRTUAL", "VSC"];
const DEPLOYED_TEXT = "DEPLOYED";
// 해제 신호도 같은 카테고리·같은 문구 체계로 오고, 두 호출부 모두 이미 해제를 다루고 있다.
// 배치(deploy)만 공용화하고 해제를 남겨두면 해제 문구가 다시 두 곳에서 갈라지므로 함께 넣는다.
const ENDING_TEXTS = ["IN THIS LAP", "ENDING"];

// 판정 불가(배치도 해제도 아닌 문구)는 null 을 돌려준다.
// 두 호출부 모두 이 경우 아무것도 하지 않는다 — 이벤트는 미발행, 상태는 직전 값 유지.
export const classifySafetyCarMessage = (
  message: string,
): SessionStatus | null => {
  const text = message.toUpperCase();

  if (text.includes(DEPLOYED_TEXT)) {
    const virtual = VIRTUAL_TEXTS.some((keyword) => text.includes(keyword));

    return virtual ? SessionStatus.VirtualSafetyCar : SessionStatus.SafetyCar;
  }

  if (ENDING_TEXTS.some((keyword) => text.includes(keyword))) {
    return SessionStatus.Green;
  }

  return null;
};
