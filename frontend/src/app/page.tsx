"use client";

import React, { useState } from "react";
import {
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { LayoutGrid, Rows3 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useAddressStore } from "@/lib/store";
import { AddressForm } from "@/components/AddressForm";
import { History } from "@/components/History";
import { JobGrowthCard } from "@/components/JobGrowthCard";
import { ComparisonTable } from "@/components/ComparisonTable";

const queryClient = new QueryClient();

export default function Page() {
  return (
    <QueryClientProvider client={queryClient}>
      <HomePage />
    </QueryClientProvider>
  );
}

function HomePage() {
  const { addresses, geoType, flushCache } = useAddressStore();
  const [view, setView] = useState<"explore" | "compare">("explore");

  return (
    <div className="flex h-screen bg-background">
      <main className="flex-1 p-6 overflow-y-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold">Market Analysis</h1>
          <div className="flex items-center gap-2">
            <Button
              variant={view === "explore" ? "secondary" : "ghost"}
              size="icon"
              onClick={() => setView("explore")}
              aria-label="Explore View"
            >
              <LayoutGrid className="size-4" />
            </Button>
            <Button
              variant={view === "compare" ? "secondary" : "ghost"}
              size="icon"
              onClick={() => setView("compare")}
              aria-label="Compare View"
            >
              <Rows3 className="size-4" />
            </Button>
          </div>
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={view}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.2 }}
          >
            {view === "explore" ? (
              <div className="grid gap-6 md:grid-cols-1 lg:grid-cols-2 xl:grid-cols-3">
                {addresses.map((address) => (
                  <JobGrowthCard
                    key={address}
                    address={address}
                    geoType={geoType}
                    flushCache={flushCache}
                  />
                ))}
              </div>
            ) : addresses.length >= 2 ? (
              <ComparisonTable
                addresses={addresses}
                geoType={geoType}
                key={addresses.join("-")} // Remount when addresses change
              />
            ) : (
              <Alert>
                <AlertTitle>Not enough addresses</AlertTitle>
                <AlertDescription>
                  Please enter at least two addresses to compare.
                </AlertDescription>
              </Alert>
            )}
          </motion.div>
        </AnimatePresence>
      </main>
      <aside className="w-96 p-6 bg-card border-l border-border overflow-y-auto">
        <div className="sticky top-0">
          <h2 className="text-xl font-semibold mb-4">Market Search</h2>
          <AddressForm />
          <History />
        </div>
      </aside>
    </div>
  );
}
