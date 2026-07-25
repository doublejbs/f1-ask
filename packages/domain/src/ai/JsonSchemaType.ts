// 툴 파라미터 스키마의 원시 타입.
// Gemini(functionDeclarations)·Claude(input_schema)·OpenAI(parameters) 가 공통으로
// 이해하는 JSON-schema 부분집합만 둔다 — 세 provider 어댑터가 같은 정의를 재사용한다.
export enum JsonSchemaType {
  Object = "object",
  String = "string",
  Number = "number",
  Integer = "integer",
  Boolean = "boolean",
  Array = "array",
}
