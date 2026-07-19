import {
  RaceEvent,
  RaceEventParamValue,
  RaceEventPriority,
  RaceEventType,
} from "@f1/domain";
import { z } from "zod";

const raceEventParamValueSchema: z.ZodType<RaceEventParamValue> = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
]);

export const raceEventSchema = z.object({
  schemaVersion: z.number().int().positive(),
  id: z.string().min(1),
  sessionId: z.string().min(1),
  type: z.nativeEnum(RaceEventType),
  priority: z.nativeEnum(RaceEventPriority),
  driverNumber: z.number().int().optional(),
  targetDriverNumber: z.number().int().optional(),
  lapNumber: z.number().int().optional(),
  timestamp: z.string().datetime(),
  params: z.record(raceEventParamValueSchema),
  deduplicationKey: z.string().min(1),
}) satisfies z.ZodType<RaceEvent>;

export const parseRaceEvent = (value: unknown): RaceEvent =>
  raceEventSchema.parse(value);

export const parseRaceEvents = (value: unknown): RaceEvent[] =>
  z.array(raceEventSchema).parse(value);
