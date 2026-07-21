// 타이어 비드 크기 변형.
// Default 는 상세 시트용 28px 비드, Compact 는 순위 행 둘째 줄용 20px 비드다.
// 행은 높이 예산이 빠듯해서(56px 고정) 상세 시트와 같은 크기를 쓸 수 없다.
export enum TireCompoundSize {
  Default = "default",
  Compact = "compact",
}
