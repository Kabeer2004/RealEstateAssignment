import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

import { AddressForm } from "@/components/AddressForm";
import { useAddressStore } from "@/lib/store";

const queryClient = new QueryClient();

// Mock react-select as it's dynamically imported and can be tricky in tests
vi.mock("react-select", () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  default: ({ options, onChange, defaultValue }: any) => {
    function handleChange(event: React.ChangeEvent<HTMLSelectElement>) {
      const option = options.find(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (o: any) => o.value === event.currentTarget.value
      );
      onChange(option);
    }
    return (
      <select
        data-testid="select-geo-type"
        value={defaultValue.value}
        onChange={handleChange}
      >
        {options.map(({ label, value }: { label: string; value: string }) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
    );
  },
}));

describe("AddressForm", () => {
  it("renders the form with initial fields", () => {
    render(
      <QueryClientProvider client={queryClient}>
        <AddressForm />
      </QueryClientProvider>
    );

    expect(screen.getByPlaceholderText("Address 1")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Fetch Job Growth Data/i })
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText("Force Refresh (Flush Cache)")
    ).toBeInTheDocument();
    expect(screen.getByTestId("select-geo-type")).toHaveValue("tract");
  });

  it("allows adding and removing address fields", () => {
    render(
      <QueryClientProvider client={queryClient}>
        <AddressForm />
      </QueryClientProvider>
    );

    const addAddressButton = screen.getByRole("button", {
      name: /Add Address/i,
    });
    fireEvent.click(addAddressButton);

    expect(screen.getByPlaceholderText("Address 1")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Address 2")).toBeInTheDocument();

    const removeButton = screen.getByLabelText("Remove address 2");
    fireEvent.click(removeButton);

    expect(screen.queryByPlaceholderText("Address 2")).not.toBeInTheDocument();
  });

  it("submits the form data to the zustand store", () => {
    render(
      <QueryClientProvider client={queryClient}>
        <AddressForm />
      </QueryClientProvider>
    );

    const addressInput = screen.getByPlaceholderText("Address 1");
    fireEvent.change(addressInput, { target: { value: "123 Test St" } });

    const geoSelect = screen.getByTestId("select-geo-type");
    fireEvent.change(geoSelect, { target: { value: "county" } });

    const submitButton = screen.getByRole("button", {
      name: /Fetch Job Growth Data/i,
    });
    fireEvent.click(submitButton);

    // Zustand updates are synchronous in tests
    const state = useAddressStore.getState();
    expect(state.addresses).toEqual(["123 Test St"]);
    expect(state.geoType).toBe("county");
  });
});
