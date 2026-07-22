// 랩 데이터 기초 연산.

export const parseMs = (date: string | null): number =>
  date === null ? Number.NaN : Date.parse(date);

// 정렬된 표본의 중앙값. 표본이 없으면 null, 짝수 개면 가운데 두 값의 평균.
// OvertakeForecast·OpenF1ContextSummary 에서 쓴다.
export const medianOf = (sortedValues: number[]): number | null => {
  const count = sortedValues.length;

  if (count === 0) {
    return null;
  }

  const mid = Math.floor(count / 2);

  if (count % 2 === 1) {
    return sortedValues[mid] ?? null;
  }

  const lower = sortedValues[mid - 1];
  const upper = sortedValues[mid];

  if (lower === undefined || upper === undefined) {
    return null;
  }

  return (lower + upper) / 2;
};
