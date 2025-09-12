"use client";

import { AddressForm } from "@/components/AddressForm";
import { History } from "@/components/History";

export function SearchPanel() {
  return (
    <>
      <h2 className="text-xl font-semibold mb-4">Market Search</h2>
      <AddressForm />
      <History />
    </>
  );
}