// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

vi.mock("./PhotoUpload", () => ({ PhotoUpload: () => <div /> }));

import { BioFields } from "./BioFields";
import { NurseTier } from "@/types/enums";

/**
 * The focal point picker only makes sense once there is a photo to position
 * (#768). Shown over an empty box it would be a control with nothing to
 * control, on the very step where she has not uploaded anything yet.
 */
afterEach(cleanup);

const values = {
  bio: "",
  photos: [] as string[],
  photo_focal_x: 50,
  photo_focal_y: 25,
};

describe("BioFields", () => {
  it("offers the framing control once there is a photo", () => {
    render(
      <BioFields
        values={{ ...values, photos: ["a.jpg"] }}
        photoUrls={["https://example.test/a.jpg"]}
        tier={NurseTier.FREE}
        onChange={vi.fn()}
        errors={{}}
      />,
    );
    expect(
      screen.getByRole("button", { name: /where your face is/i }),
    ).toBeInTheDocument();
  });

  it("does not offer it before she has uploaded one", () => {
    render(
      <BioFields
        values={values}
        photoUrls={[]}
        tier={NurseTier.FREE}
        onChange={vi.fn()}
        errors={{}}
      />,
    );
    expect(
      screen.queryByRole("button", { name: /where your face is/i }),
    ).toBeNull();
  });
});
