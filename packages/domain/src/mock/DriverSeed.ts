// Mock 시나리오용 드라이버 시드 데이터.
// gridPosition 순서대로 스타팅 그리드를 구성한다.
export type DriverSeed = {
  driverNumber: number;
  code: string;
  fullName: string;
  teamName: string;
  gridPosition: number;
};

export const MOCK_DRIVER_SEEDS: readonly DriverSeed[] = [
  { driverNumber: 1, code: "VER", fullName: "Max Verstappen", teamName: "Red Bull Racing", gridPosition: 1 },
  { driverNumber: 11, code: "PER", fullName: "Sergio Perez", teamName: "Red Bull Racing", gridPosition: 2 },
  { driverNumber: 16, code: "LEC", fullName: "Charles Leclerc", teamName: "Ferrari", gridPosition: 3 },
  { driverNumber: 55, code: "SAI", fullName: "Carlos Sainz", teamName: "Ferrari", gridPosition: 4 },
  { driverNumber: 4, code: "NOR", fullName: "Lando Norris", teamName: "McLaren", gridPosition: 5 },
  { driverNumber: 81, code: "PIA", fullName: "Oscar Piastri", teamName: "McLaren", gridPosition: 6 },
  { driverNumber: 44, code: "HAM", fullName: "Lewis Hamilton", teamName: "Mercedes", gridPosition: 7 },
  { driverNumber: 63, code: "RUS", fullName: "George Russell", teamName: "Mercedes", gridPosition: 8 },
  { driverNumber: 14, code: "ALO", fullName: "Fernando Alonso", teamName: "Aston Martin", gridPosition: 9 },
  { driverNumber: 18, code: "STR", fullName: "Lance Stroll", teamName: "Aston Martin", gridPosition: 10 },
  { driverNumber: 10, code: "GAS", fullName: "Pierre Gasly", teamName: "Alpine", gridPosition: 11 },
  { driverNumber: 31, code: "OCO", fullName: "Esteban Ocon", teamName: "Alpine", gridPosition: 12 },
  { driverNumber: 23, code: "ALB", fullName: "Alexander Albon", teamName: "Williams", gridPosition: 13 },
  { driverNumber: 2, code: "SAR", fullName: "Logan Sargeant", teamName: "Williams", gridPosition: 14 },
  { driverNumber: 22, code: "TSU", fullName: "Yuki Tsunoda", teamName: "RB", gridPosition: 15 },
  { driverNumber: 3, code: "RIC", fullName: "Daniel Ricciardo", teamName: "RB", gridPosition: 16 },
  { driverNumber: 77, code: "BOT", fullName: "Valtteri Bottas", teamName: "Kick Sauber", gridPosition: 17 },
  { driverNumber: 24, code: "ZHO", fullName: "Zhou Guanyu", teamName: "Kick Sauber", gridPosition: 18 },
  { driverNumber: 20, code: "MAG", fullName: "Kevin Magnussen", teamName: "Haas", gridPosition: 19 },
  { driverNumber: 27, code: "HUL", fullName: "Nico Hulkenberg", teamName: "Haas", gridPosition: 20 },
];
