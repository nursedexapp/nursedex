// @vitest-environment node
import { describe, it, expect, beforeEach } from "vitest";
import type { NextRequest } from "next/server";
import { GET, POST } from "./route";

/**
 * A request the handler can actually RUN, not just be refused by.
 *
 * It used to carry only headers, which is all the guard reads. That was enough
 * while the guard was there and a trap once it was gone: GET ran on to
 * `request.nextUrl.searchParams` and threw a TypeError, so the test went red on
 * the crash rather than on its own 401 assertion. It would have gone red with
 * the assertion DELETED too, which means the assertion was not what protected
 * the route, and the mutation gate could not see it because a POST sibling in
 * the same file failed on a real assertion and carried the whole file to KILLED
 * (#648).
 *
 * With a nextUrl the guardless handler runs on and answers 400 (bad request_id),
 * the 401 assertion is what fails, and the test is load-bearing again.
 */
function req(secretHeader: string | null): NextRequest {
  return {
    headers: { get: () => secretHeader },
    // A request_id that is not a number on purpose. Omitting it does NOT work:
    // Number(null) is 0, which is finite, so the handler would sail past its own
    // 400 and reach the real service-role client.
    nextUrl: new URL("https://nursedex.com/api/slack/track?request_id=nope"),
  } as unknown as NextRequest;
}

beforeEach(() => {
  delete process.env.ADMIN_SECRET;
});

describe("/api/slack/track auth guard", () => {
  it("GET returns 401 when ADMIN_SECRET is unset, even against the literal string 'undefined'", async () => {
    const res = await GET(req("undefined"));
    expect(res.status).toBe(401);
  });

  it("GET returns 401 with the wrong secret", async () => {
    process.env.ADMIN_SECRET = "secret";
    const res = await GET(req("wrong"));
    expect(res.status).toBe(401);
  });

  it("POST returns 401 when ADMIN_SECRET is unset", async () => {
    const res = await POST(req("undefined"));
    expect(res.status).toBe(401);
  });

  it("POST returns 401 with the wrong secret", async () => {
    process.env.ADMIN_SECRET = "secret";
    const res = await POST(req("wrong"));
    expect(res.status).toBe(401);
  });
});
