// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, afterEach } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";

const h = vi.hoisted(() => ({
  resolve: null as null | ((path: string, url: string) => void),
}));

// Stands in for a real upload finishing: the component reports the URL it has
// just been given for the photo it uploaded.
vi.mock("./PhotoUpload", () => ({
  PhotoUpload: (props: {
    onPhotoResolved?: (path: string, url: string) => void;
  }) => {
    h.resolve = props.onPhotoResolved ?? null;
    return <div />;
  },
}));

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

describe("BioFields right after an upload", () => {
  it("offers the framing control before the page has been reloaded", async () => {
    // The server-rendered URL list only covers photos that existed at page
    // load, so during sign-up it is empty for the photo she just uploaded.
    // Without this the control never appears on the step where she adds it,
    // and she would have to find it later on the edit page.
    const { rerender } = render(
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

    await act(async () => {
      h.resolve?.("nurse/a.jpg", "https://example.test/signed/a.jpg");
    });
    rerender(
      <BioFields
        values={{ ...values, photos: ["nurse/a.jpg"] }}
        photoUrls={[]}
        tier={NurseTier.FREE}
        onChange={vi.fn()}
        errors={{}}
      />,
    );

    expect(
      screen.getByRole("button", { name: /where your face is/i }),
    ).toBeInTheDocument();
  });
});
