import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { seedDataset, type DataSource } from "@/data";
import { ContributeUpload } from "@/dashboard/components/ContributeUpload";
import { VaultProvider } from "@/dashboard/VaultContext";
import { AuthProvider } from "@/hooks/AuthContext";
import { DemoAuthService } from "@/services/DemoAuthService";
import { stubSource } from "@/__tests__/harness";

const CONTRIB = JSON.stringify({
  assets: [{ type: "skill", name: "Donated", slug: "donated", body: "b" }],
});

function renderUpload(overrides: Partial<DataSource>) {
  const source: DataSource = {
    ...stubSource(structuredClone(seedDataset)),
    ...overrides,
  };
  render(
    <AuthProvider authService={new DemoAuthService()}>
      <MemoryRouter>
        <VaultProvider dataSource={source}>
          <ContributeUpload />
        </VaultProvider>
      </MemoryRouter>
    </AuthProvider>,
  );
}

function jsonFile() {
  const file = new File([CONTRIB], "contrib.json", {
    type: "application/json",
  });
  // jsdom does not implement Blob.text(); make it resolve so the component's
  // own parse/branch logic is what the test exercises.
  Object.defineProperty(file, "text", {
    value: () => Promise.resolve(CONTRIB),
  });
  return file;
}

describe("ContributeUpload", () => {
  it("merges directly through importProjection in the default mode", async () => {
    const importProjection = vi
      .fn()
      .mockResolvedValue({ added: 1, updated: 0 });
    const submitProjection = vi.fn();
    renderUpload({ importProjection, submitProjection });

    fireEvent.change(screen.getByLabelText(/contribution file/i), {
      target: { files: [jsonFile()] },
    });

    await waitFor(() => expect(importProjection).toHaveBeenCalledTimes(1));
    expect(submitProjection).not.toHaveBeenCalled();
  });

  it("stages a submission through submitProjection in review mode", async () => {
    const importProjection = vi.fn();
    const submitProjection = vi.fn().mockResolvedValue({
      id: "sub-9",
      itemCount: 1,
    });
    renderUpload({ importProjection, submitProjection });

    await userEvent.click(
      screen.getByRole("radio", { name: /submit for review/i }),
    );
    fireEvent.change(screen.getByLabelText(/contribution file/i), {
      target: { files: [jsonFile()] },
    });

    await waitFor(() => expect(submitProjection).toHaveBeenCalledTimes(1));
    expect(importProjection).not.toHaveBeenCalled();
    const [, meta] = submitProjection.mock.calls[0];
    expect(meta.submittedByOwnerId).toBeTruthy();
  });
});
