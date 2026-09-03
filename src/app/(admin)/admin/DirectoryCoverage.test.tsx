// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { DirectoryCoverage } from "./DirectoryCoverage";

// #939. The numbers on this panel are the only reading anybody has of how
// much of the verified roster families can actually see, so the panel has to
// be honest about not having them. A read that failed must not arrive as a
// row of zeros, which is a confident claim that the directory is empty.

afterEach(cleanup);

describe("DirectoryCoverage", () => {
  it("shows the verified, listed and searchable counts", () => {
    render(
      <DirectoryCoverage
        coverage={{
          ok: true,
          verified: 100,
          listed: 60,
          searchable: 59,
          unlisted: 40,
          reconciles: true,
        }}
      />,
    );
    expect(screen.getByText("Verified")).toBeInTheDocument();
    expect(screen.getByText("100")).toBeInTheDocument();
    expect(screen.getByText("Listed")).toBeInTheDocument();
    expect(screen.getByText("60")).toBeInTheDocument();
    expect(screen.getByText("Searchable")).toBeInTheDocument();
    expect(screen.getByText("59")).toBeInTheDocument();
  });

  it("says how many verified nurses families cannot see", () => {
    render(
      <DirectoryCoverage
        coverage={{
          ok: true,
          verified: 100,
          listed: 60,
          searchable: 59,
          unlisted: 40,
          reconciles: true,
        }}
      />,
    );
    expect(
      screen.getByText(/40 verified nurses are not listed/i),
    ).toBeInTheDocument();
  });

  it("keeps the sentence right when only one nurse is unlisted", () => {
    render(
      <DirectoryCoverage
        coverage={{
          ok: true,
          verified: 100,
          listed: 99,
          searchable: 99,
          unlisted: 1,
          reconciles: true,
        }}
      />,
    );
    expect(
      screen.getByText(/1 verified nurse is not listed/i),
    ).toBeInTheDocument();
  });

  it("congratulates nothing when every verified nurse is listed", () => {
    render(
      <DirectoryCoverage
        coverage={{
          ok: true,
          verified: 100,
          listed: 100,
          searchable: 100,
          unlisted: 0,
          reconciles: true,
        }}
      />,
    );
    expect(
      screen.getByText(/every verified nurse is listed/i),
    ).toBeInTheDocument();
  });

  it("reports a failed read as a failure rather than as zeros", () => {
    render(
      <DirectoryCoverage
        coverage={{
          ok: false,
          failed: "listed",
          message: "permission denied for table nurse_profiles",
        }}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent(/could not be read/i);
    expect(screen.getByRole("alert")).toHaveTextContent("listed");
    expect(
      screen.getByText(/permission denied for table nurse_profiles/),
    ).toBeInTheDocument();
    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });

  it("flags the two directory filters drifting apart", () => {
    render(
      <DirectoryCoverage
        coverage={{
          ok: true,
          verified: 100,
          listed: 60,
          searchable: 59,
          unlisted: 30,
          reconciles: false,
        }}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent(/do not add up/i);
  });

  it("shows no drift warning when the counts reconcile", () => {
    render(
      <DirectoryCoverage
        coverage={{
          ok: true,
          verified: 100,
          listed: 60,
          searchable: 59,
          unlisted: 40,
          reconciles: true,
        }}
      />,
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
