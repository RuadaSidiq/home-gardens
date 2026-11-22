"use client";
import Link from "next/link";
import { Heart } from "lucide-react";
import { ActionButton } from "@/components/ui/form";
import { toggleSavedGardener } from "./actions";

export function SaveGardenerButton({ gardenerId, saved, signedIn }: { gardenerId: string; saved: boolean; signedIn: boolean }) {
  if (!signedIn) return <Link href="/login" className="flex h-10 w-full items-center justify-center gap-2 rounded-md border border-sand-300 text-sm font-semibold hover:bg-sand-50"><Heart className="h-4 w-4" /> Save gardener</Link>;
  return (
    <ActionButton action={toggleSavedGardener} fields={{ gardenerId }} variant="outline" size="md" className="w-full [&>button]:w-full">
      <Heart className={saved ? "h-4 w-4 fill-clay-500 text-clay-500" : "h-4 w-4"} /> {saved ? "Saved" : "Save gardener"}
    </ActionButton>
  );
}
