/**
 * UI와 플랫폼에 독립적인 Bingoji 전투 규칙의 공용 진입점입니다.
 *
 * React 화면과 Cloudflare Worker는 내부 파일을 직접 참조하지 않고 이 모듈을
 * 통해 동일한 타입, RNG, Bingo 판정과 전투 reducer를 사용합니다.
 */
export * from "./combat";
export * from "./lines";
export * from "./rng";
export type * from "./types";
