// Google Generative Language API 의 발화자 역할.
// Anthropic/OpenAI 의 "assistant" 에 해당하는 값이 "model" 이라 별도 enum 으로 둔다.
export enum GeminiChatRole {
  User = "user",
  Model = "model",
}
