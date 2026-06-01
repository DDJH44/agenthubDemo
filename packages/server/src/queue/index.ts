import type { IJobQueue, JobPayload, JobResult } from "./types";
import { MemoryQueue } from "./memory";

let queue: IJobQueue;

export function getQueue(): IJobQueue {
  if (!queue) {
    // TODO: switch to RedisQueue when REDIS_URL is set
    queue = new MemoryQueue();
  }
  return queue;
}

export type { IJobQueue, JobPayload, JobResult };
