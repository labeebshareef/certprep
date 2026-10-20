import { loadCourse, type LoadedCourse } from "@/lib/content";

let cached: Promise<LoadedCourse> | undefined;
export function course() {
  return (cached ??= loadCourse("dva-c03"));
}

export const UID = "00000000-0000-0000-0000-000000000001";
export const CLOCK = { timezone: "Asia/Dubai", rolloverHour: 4 };
