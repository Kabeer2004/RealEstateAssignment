"use client";

import React from "react";
import { useForm, FormProvider, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useIsFetching, useQueryClient } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import { motion } from "framer-motion";
import { type StylesConfig } from "react-select";

import { useAddressStore } from "@/lib/store";
import { addressSchema } from "@/lib/schema";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Plus, X, Loader2 } from "lucide-react";

type AddressFormData = z.infer<typeof addressSchema>;

// Dynamically import react-select to prevent SSR hydration errors
const ClientOnlySelect = dynamic(() => import("react-select"), { ssr: false });

type GeoOption = {
  value: "tract" | "zip" | "county";
  label: string;
};

const customSelectStyles: StylesConfig = {
  control: (base, { isFocused }) => ({
    ...base,
    backgroundColor: "var(--card)",
    borderColor: isFocused ? "var(--ring)" : "var(--border)",
    boxShadow: isFocused ? "0 0 0 1px var(--ring)" : "none",
    "&:hover": {
      borderColor: "var(--ring)",
    },
  }),
  menu: (base) => ({
    ...base,
    backgroundColor: "var(--popover)",
    color: "var(--popover-foreground)",
    border: "1px solid var(--border)",
  }),
  option: (base, { isFocused, isSelected }) => ({
    ...base,
    backgroundColor: isSelected
      ? "var(--primary)"
      : isFocused
      ? "var(--accent)"
      : "var(--popover)",
    color: isSelected ? "var(--primary-foreground)" : "var(--foreground)",
    "&:active": {
      backgroundColor: "var(--accent)",
    },
  }),
  singleValue: (base) => ({
    ...base,
    color: "var(--foreground)",
  }),
  input: (base) => ({
    ...base,
    color: "var(--foreground)",
  }),
  indicatorSeparator: (base) => ({
    ...base,
    backgroundColor: "var(--border)",
  }),
};

export function AddressForm() {
  const { setAddresses, setGeoType, flushCache, setFlushCache } =
    useAddressStore();

  const isFetching = useIsFetching() > 0;
  const queryClient = useQueryClient();

  const methods = useForm<AddressFormData>({
    resolver: zodResolver(addressSchema),
    defaultValues: {
      addresses: [{ value: "" }],
      geoType: "tract",
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: methods.control,
    name: "addresses",
  });

  const onSubmit = (data: AddressFormData) => {
    const addressValues = data.addresses
      .map((a) => a.value)
      .filter((a) => a.trim());
    if (flushCache) {
      addressValues.forEach((address) => {
        queryClient.removeQueries({
          queryKey: ["jobGrowth", address, data.geoType],
        });
      });
    }
    setAddresses(addressValues);
    setGeoType(data.geoType);
  };

  return (
    <FormProvider {...methods}>
      <motion.form
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.5 }}
        onSubmit={methods.handleSubmit(onSubmit)}
        className="space-y-6"
      >
        <div>
          <label className="block text-sm font-medium mb-2">Addresses</label>
          <div className="space-y-2">
            {fields.map((field, index) => (
              <div key={field.id} className="flex items-center gap-2">
                <Input
                  {...methods.register(`addresses.${index}.value`)}
                  placeholder={`Address ${index + 1}`}
                  className="flex-grow"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => remove(index)}
                  disabled={fields.length <= 1}
                >
                  <X className="size-4" />
                </Button>
              </div>
            ))}
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-2"
            onClick={() => append({ value: "" })}
          >
            <Plus className="mr-2 size-4" />
            Add Address
          </Button>
          {methods.formState.errors.addresses && (
            <p className="text-red-500 text-sm mt-1">
              {methods.formState.errors.addresses.message ||
                methods.formState.errors.addresses.root?.message}
            </p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">
            Geography Level
          </label>
          <ClientOnlySelect
            options={[
              { value: "tract", label: "Census Tract" },
              { value: "zip", label: "ZIP Code" },
              { value: "county", label: "County" },
            ]}
            onChange={(opt: unknown) => {
              const selectedOption = opt as GeoOption | null;
              const geoTypeValue = selectedOption?.value || "tract";
              methods.setValue("geoType", geoTypeValue);
              setGeoType(geoTypeValue);
            }}
            defaultValue={{
              value: "tract",
              label: "Census Tract",
            }}
            styles={customSelectStyles}
            classNamePrefix="custom-select"
          />
        </div>

        <div className="flex items-center space-x-2">
          <Checkbox
            id="flush-cache"
            checked={flushCache}
            onCheckedChange={(checked) => setFlushCache(Boolean(checked))}
          />
          <label
            htmlFor="flush-cache"
            className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
          >
            Force Refresh (Flush Cache)
          </label>
        </div>

        <Button type="submit" className="w-full" disabled={isFetching}>
          {isFetching && <Loader2 className="mr-2 size-4 animate-spin" />}
          {isFetching ? "Fetching Data..." : "Fetch Job Growth Data"}
        </Button>
      </motion.form>
    </FormProvider>
  );
}
