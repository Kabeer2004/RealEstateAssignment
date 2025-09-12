"use client";

import { useState, Fragment } from "react";
import { useForm, FormProvider, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
	useQueries,
	QueryClient,
	QueryClientProvider,
} from "@tanstack/react-query";
import axios from "axios";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, X } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

const compareAddressSchema = z.object({
	addresses: z
		.array(
			z.object({
				value: z.string().min(1, { message: "Address cannot be empty." }),
			})
		)
		.min(2, { message: "Please enter at least two addresses to compare." }),
});

type CompareFormData = z.infer<typeof compareAddressSchema>;

const queryClient = new QueryClient();

export default function ComparePageWrapper() {
	return (
		<QueryClientProvider client={queryClient}>
			<ComparePage />
		</QueryClientProvider>
	);
}

function ComparePage() {
	const [comparisonAddresses, setComparisonAddresses] = useState<string[]>([]);

	const methods = useForm<CompareFormData>({
		resolver: zodResolver(compareAddressSchema),
		defaultValues: {
			addresses: [{ value: "" }, { value: "" }],
		},
	});

	const { fields, append, remove } = useFieldArray({
		control: methods.control,
		name: "addresses",
	});

	const onSubmit = (data: CompareFormData) => {
		setComparisonAddresses(
			data.addresses.map((a) => a.value).filter((a) => a.trim())
		);
	};

	const results = useQueries({
		queries: comparisonAddresses.map((address) => ({
			queryKey: ["jobGrowth", address, "tract"], // Defaulting to tract for comparison
			queryFn: async () => {
				const { data } = await axios.get(
					"http://localhost:8000/api/job-growth",
					{ params: { address, geo_type: "tract" } }
				);
				return data;
			},
			retry: false,
		})),
	});

	return (
		<div className="p-6">
			<h1 className="text-3xl font-bold">Compare Markets</h1>

			<FormProvider {...methods}>
				<motion.form
					initial={{ opacity: 0, y: -20 }}
					animate={{ opacity: 1, y: 0 }}
					onSubmit={methods.handleSubmit(onSubmit)}
					className="my-6 p-6 bg-card border rounded-lg max-w-4xl"
				>
					<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
						{fields.map((field, index) => (
							<div key={field.id} className="flex items-center gap-2">
								<Input
									{...methods.register(`addresses.${index}.value`)}
									placeholder={`Address ${index + 1}`}
								/>
								<Button
									type="button"
									variant="ghost"
									size="icon"
									onClick={() => remove(index)}
									disabled={fields.length <= 2}
								>
									<X className="size-4" />
								</Button>
							</div>
						))}
					</div>
					<div className="flex items-center gap-4 mt-4">
						<Button
							type="button"
							variant="outline"
							size="sm"
							onClick={() => append({ value: "" })}
						>
							<Plus className="mr-2 size-4" />
							Add Address
						</Button>
						<Button type="submit">Compare</Button>
					</div>
					{methods.formState.errors.addresses && (
						<p className="text-red-500 text-sm mt-2">
							{methods.formState.errors.addresses.message ||
								methods.formState.errors.addresses.root?.message}
						</p>
					)}
				</motion.form>
			</FormProvider>

			{comparisonAddresses.length > 0 && <ComparisonTable results={results} />}
		</div>
	);
}

function ComparisonTable({ results }: { results: any[] }) {
	const attributes = [
		{ label: "Total Jobs", path: "total_jobs", format: (v: number) => v?.toLocaleString() ?? "N/A" },
		{ label: "Unemployment Rate", path: "unemployment_rate", format: (v: number) => v?.toFixed(1) + "%" ?? "N/A" },
		{ label: "Labor Force", path: "labor_force", format: (v: number) => v?.toLocaleString() ?? "N/A" },
		{ label: "1Y Growth", path: "growth.1y", format: (v: number) => v + "%" ?? "N/A" },
		{ label: "2Y Growth", path: "growth.2y", format: (v: number) => v + "%" ?? "N/A" },
		{ label: "5Y Growth", path: "growth.5y", format: (v: number) => v + "%" ?? "N/A" },
		{ label: "Top Sector 1", path: "top_sectors_growing.0", format: (v: any) => v ? `${v.name}: ${v.growth}%` : "N/A" },
		{ label: "Top Sector 2", path: "top_sectors_growing.1", format: (v: any) => v ? `${v.name}: ${v.growth}%` : "N/A" },
		{ label: "Top Sector 3", path: "top_sectors_growing.2", format: (v: any) => v ? `${v.name}: ${v.growth}%` : "N/A" },
		{ label: "Data Source", path: "source" },
	];

	const getNestedValue = (obj: any, path: string) => {
		if (!obj) return "N/A";
		const data = obj.granular_data && !obj.granular_data.error ? obj.granular_data : (obj.county_context || {});
		return path.split('.').reduce((acc, part) => acc && acc[part], data);
	};

	return (
		<div className="w-full overflow-auto border rounded-lg">
			<div className="relative grid" style={{ gridTemplateColumns: `minmax(200px, 1fr) repeat(${results.length}, minmax(300px, 1fr))` }}>
				{/* Header Row */}
				<div className="sticky top-0 left-0 z-20 p-4 font-semibold bg-card border-b border-r">Attribute</div>
				{results.map((result, index) => (
					<div key={index} className="sticky top-0 z-10 p-4 font-semibold bg-card border-b truncate">
						{result.isLoading ? <Skeleton className="h-6 w-3/4" /> : result.isError ? "Error" : result.data?.geo?.lat ? `${result.data.geo.lat.toFixed(4)}, ${result.data.geo.lon.toFixed(4)}` : "Unknown Address"}
					</div>
				))}

				{/* Attribute Rows */}
				{attributes.map((attr) => (
					<Fragment key={attr.label}>
						<div className="sticky left-0 z-10 p-4 font-medium bg-card border-b border-r">{attr.label}</div>
						{results.map((result, index) => (
							<div key={index} className="p-4 border-b">
								{result.isLoading ? (
									<Skeleton className="h-6 w-1/2" />
								) : result.isError ? (
									<Alert variant="destructive" className="p-2">
										<AlertDescription>{axios.isAxiosError(result.error) ? result.error.response?.data?.detail : result.error.message}</AlertDescription>
									</Alert>
								) : (
									<div className="text-sm">
										{(() => {
											const value = getNestedValue(result.data, attr.path);
											if (value === undefined || value === null) return "N/A";

											const formattedValue = attr.format ? attr.format(value) : value;

											if (attr.label.includes("Sector")) {
												const sector = getNestedValue(result.data, attr.path);
												return sector && sector.name ? (
													<Badge variant={sector.growth > 0 ? "default" : "secondary"}>
														{formattedValue}
													</Badge>
												) : "N/A";
											}
											return formattedValue;
										})()}
									</div>
								)}
							</div>
						))}
					</Fragment>
				))}
			</div>
		</div>
	);
}
