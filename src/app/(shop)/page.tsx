import { Suspense } from "react";
import { AtelierTeaser } from "@/components/shop/home/AtelierTeaser";
import { FeaturedCarbon } from "@/components/shop/home/FeaturedCarbon";
import { FeaturedWheels } from "@/components/shop/home/FeaturedWheels";
import { Hero } from "@/components/shop/home/Hero";
import { HowItWorks } from "@/components/shop/home/HowItWorks";
import { ShelfSkeleton } from "@/components/shop/home/ShelfSkeleton";
import { ValueStrip } from "@/components/shop/home/ValueStrip";

export default function HomePage() {
  return (
    <>
      <Hero />
      <ValueStrip />
      <Suspense fallback={<ShelfSkeleton />}>
        <FeaturedWheels />
      </Suspense>
      <Suspense fallback={<ShelfSkeleton />}>
        <FeaturedCarbon />
      </Suspense>
      <HowItWorks />
      <AtelierTeaser />
    </>
  );
}
