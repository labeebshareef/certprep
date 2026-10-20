# Question authoring rules (DVA-C03 seed bank)

Target: scenario-style items indistinguishable from the real AWS Developer Associate exam. The explanation IS the lesson — a learner who only ever reads these explanations should be able to answer any variant of the question on exam day.

## Hard rules (validator enforces most of these)
1. File shape: `{ "schemaVersion": 1, "courseId": "dva-c03", "sectionId": "<section>", "title": "<title>", "questions": [ ... ] }`.
2. `id` = `dva-c03/<sectionId>/0001`, `0002`, ... zero-padded 4 digits, sequential, never reused.
3. `type: "single"` → exactly 4 choices (ids a–d), exactly 1 correct, `selectCount: 1`.
   `type: "multi"` → 5 or 6 choices (ids a–e/f), `selectCount` 2 or 3 correct, stem ends with "(Choose TWO.)" or "(Choose THREE.)". About 25% of items are multi.
4. Choice ids are `a,b,c,...` in order. The correct answer must NOT sit in the same position every time and must NOT be systematically the longest option.
5. Every choice has its own `explanation` (≥ 20 chars). For wrong choices, say WHY it is wrong **under this question's qualifier** (not just "this is wrong"). For right choices, state the mechanism.
6. `explanation` (overall, ≥ 40 chars): the key idea / rule of thumb to remember, 2–4 sentences. Mention the distinguishing fact that separates the best answer from the closest distractor.
7. `references`: ≥ 1 link to AWS docs (`https://docs.aws.amazon.com/...` or `https://aws.amazon.com/...`). Use URLs you are confident exist; the service developer-guide root is acceptable when you are unsure of a deep link.
8. `domainId` must match the section's domain. `taskId` is the C02 task statement id (`1.1`–`1.3`, `2.1`–`2.3`, `3.1`–`3.4`, `4.1`–`4.3`); set it.
9. `services`: lowercase slugs: `lambda`, `dynamodb`, `sqs`, `sns`, `eventbridge`, `kinesis`, `step-functions`, `s3`, `iam`, `sts`, `cognito`, `kms`, `secrets-manager`, `parameter-store`, `codepipeline`, `codebuild`, `codedeploy`, `sam`, `cloudformation`, `cdk`, `api-gateway`, `elastic-beanstalk`, `ecs`, `ecr`, `fargate`, `cloudwatch`, `x-ray`, `elasticache`, `dax`, `cloudfront`, `appconfig`, `cloudtrail`, `amplify`, `ssm`, `acm`.
10. `difficulty`: 1 (recall a fact), 2 (apply a rule to a scenario), 3 (discriminate between two valid designs). Mix ≈ 30/50/20.
11. `meta`: `{ "author": "claude", "reviewed": false, "createdAt": "2026-10-20" }`.
12. Valid JSON only. No trailing commas, no comments, no markdown fences in the file.

## Protected-term markup (required — the Malayalam overlay depends on it)
Wrap every AWS service / feature name in `{{t:...}}` and every API action, CLI flag, config key, header, error string or code identifier in `{{code:...}}`:
- `{{t:AWS Lambda}}`, `{{t:Amazon DynamoDB}}`, `{{t:DynamoDB Streams}}`, `{{t:Amazon SQS}}`, `{{t:dead-letter queue}}`, `{{t:AWS KMS}}`, `{{t:Lambda layers}}`
- `{{code:ReturnConsumedCapacity}}`, `{{code:--query}}`, `{{code:ProvisionedThroughputExceededException}}`, `{{code:maxReceiveCount}}`, `{{code:x-amz-server-side-encryption}}`, `{{code:AWS::Serverless::Function}}`
Use the full official name on first use in a stem (`{{t:Amazon DynamoDB}}`), the short name afterwards (`{{t:DynamoDB}}`). Plain English words (queue, table, function, role, policy) are NOT wrapped. Never nest tokens. Never put `{{` anywhere else.

## Style rules (what makes it feel like the real exam)
- Stem = 2–5 sentences: a developer/company, a concrete situation, a constraint, then the question. ≥ 70% of stems end with a qualifier in caps: **MOST cost-effective**, **LEAST operational overhead**, **MOST secure**, **fewest code changes**, **MOST efficient**, **LOWEST latency**, **FASTEST**.
- Distractors must be *plausible to someone with incomplete knowledge*: a real service used slightly wrong, the right service with the wrong feature, a solution that works but violates the qualifier. No joke options.
- At least two options should be technically workable so the qualifier decides. Exactly one (or `selectCount`) must be clearly best under the qualifier — no ambiguity. If you cannot write an unambiguous key, change the scenario.
- Prefer the developer's point of view (SDK, CLI, SAM template, IAM policy, env vars, API behaviour) over architect-level design.
- Include at least 2 items per file that hinge on a specific number/limit or error name the exam loves (e.g. Lambda 15-minute timeout, DynamoDB 400 KB item limit, SQS visibility timeout vs Lambda timeout, `ProvisionedThroughputExceededException` + exponential backoff, KMS 4 KB `Encrypt` limit → envelope encryption, API Gateway 29-second integration timeout).
- Facts must be current as of 2026 and verifiable in AWS docs. If unsure of a limit, pick a different fact rather than guessing.
- Do not reproduce any real exam question. Write original scenarios.

## Worked example (copy this shape exactly)
```json
{
  "id": "dva-c03/lambda/0001",
  "revision": 1,
  "changeKind": "material",
  "type": "multi",
  "selectCount": 2,
  "difficulty": 2,
  "domainId": "d1",
  "taskId": "1.2",
  "services": ["lambda", "sqs"],
  "tags": ["error-handling", "least-ops-overhead", "dlq"],
  "stem": "A developer has an {{t:AWS Lambda}} function that is invoked by an {{t:Amazon SQS}} standard queue through an event source mapping. A few malformed messages cause the function to throw an exception every time they are received, and the same messages keep being retried, which delays all other messages. The developer must isolate the malformed messages for later inspection and keep the rest of the queue flowing. Which combination of actions will meet these requirements with the LEAST operational overhead? (Choose TWO.)",
  "choices": [
    { "id": "a", "text": "Configure a {{t:dead-letter queue}} on the source queue with a {{code:maxReceiveCount}} of 3.", "correct": true, "explanation": "A redrive policy on the SQS queue moves a message to the DLQ after it has been received (and not deleted) {{code:maxReceiveCount}} times, so poison messages leave the main queue automatically with no code." },
    { "id": "b", "text": "Wrap the message handling in a try/catch block and write failed messages to {{t:Amazon S3}} before returning successfully.", "correct": false, "explanation": "This works, but it moves error handling into custom code that must be written, tested and maintained; SQS already provides a redrive policy for exactly this case, so it is more overhead than necessary." },
    { "id": "c", "text": "Enable {{code:ReportBatchItemFailures}} in the event source mapping and return the failed message IDs from the function.", "correct": true, "explanation": "Partial batch responses let Lambda delete the successfully processed messages and retry only the failed ones, so one bad message no longer forces the whole batch to be retried and delays the good messages." },
    { "id": "d", "text": "Increase the function timeout to 15 minutes so that the function can retry the message internally.", "correct": false, "explanation": "Longer timeouts do not fix a malformed message; the function would still fail, and the message would still be retried, now holding the batch (and the visibility timeout) for longer." },
    { "id": "e", "text": "Configure a {{t:Lambda}} on-failure destination that points to an {{t:Amazon SNS}} topic.", "correct": false, "explanation": "On-failure destinations apply to asynchronous invocations (for example from S3 or SNS). SQS event source mappings are poll-based and do not use destinations; failures are handled by the queue's redrive policy instead." }
  ],
  "explanation": "For SQS-triggered Lambda, poison-message isolation is a queue feature (redrive policy / DLQ), and batch-level blocking is solved by partial batch responses ({{code:ReportBatchItemFailures}}). Destinations are for asynchronous invocations, not for poll-based event sources. Remember: SQS → DLQ on the queue; async invokes (S3, SNS, EventBridge) → Lambda destinations or the function's own DLQ setting.",
  "references": [
    { "title": "Using Lambda with Amazon SQS – partial batch responses", "url": "https://docs.aws.amazon.com/lambda/latest/dg/with-sqs.html" },
    { "title": "Amazon SQS dead-letter queues", "url": "https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-dead-letter-queues.html" }
  ],
  "meta": { "author": "claude", "reviewed": false, "createdAt": "2026-10-20" }
}
```

## Validate before you finish
```
cd /home/user/dva-bank && npx tsx scripts/validate-topic.ts content/dva-c03 topics/<file>.json
```
Fix every ERROR. Then run `npx tsx scripts/hash.ts content/dva-c03` is NOT your job — the coordinator stamps hashes.
