/**
 * Seeds the database.
 *
 *   npm run db:seed              reference data + demo content (local / staging)
 *   npm run db:seed -- --minimal reference data only (production)
 *
 * Reference data: currencies, countries, cities, taxes, roles & permissions, settings,
 * service and product catalogue, delivery zones, notification templates, CMS defaults.
 * Demo content: sample staff/gardener/customer accounts, testimonials and projects.
 * No transactions, payments, reviews or ratings are fabricated.
 */
import "dotenv/config";

import { db, schema, sqlClient } from "../src/db";
import { PERMISSIONS, DEFAULT_ROLES } from "../src/server/auth/permissions";
import { DEFAULT_TEMPLATES } from "../src/server/notify/templates";
import { hashPassword } from "../src/server/auth/password";
import { unsplash as U, pexels as P } from "../src/lib/images";
import { slugify } from "../src/lib/ids";

const minimal = process.argv.includes("--minimal");
const ghs = (n: number) => Math.round(n * 100);

async function main() {
  const [existing] = await db.select().from(schema.currencies).limit(1);
  if (existing) {
    console.log("Database already seeded – run `npm run db:reset` to start over.");
    return;
  }

  /* ---------------- Currencies & rates ---------------- */
  await db.insert(schema.currencies).values([
    { code: "GHS", name: "Ghanaian cedi", symbol: "GH₵" },
    { code: "USD", name: "US dollar", symbol: "$" },
    { code: "GBP", name: "British pound", symbol: "£" },
    { code: "EUR", name: "Euro", symbol: "€" },
    { code: "NGN", name: "Nigerian naira", symbol: "₦" },
  ]);
  // Starting rates only – update them in Admin → Locations → Currencies before going live.
  await db.insert(schema.exchangeRates).values([
    { base: "USD", quote: "GHS", rate: "15.20000000", source: "seed" },
    { base: "GBP", quote: "USD", rate: "1.27000000", source: "seed" },
    { base: "EUR", quote: "USD", rate: "1.08000000", source: "seed" },
    { base: "USD", quote: "NGN", rate: "1550.00000000", source: "seed" },
  ]);

  /* ---------------- Countries, regions, cities ---------------- */
  await db.insert(schema.countries).values([
    { code: "GH", name: "Ghana", currency: "GHS", phoneCode: "+233", timezone: "Africa/Accra", addressFormat: { postalCodeRequired: false, regionLabel: "Region", postalLabel: "GhanaPost GPS address" }, paymentProviders: ["paystack", "hubtel", "manual"], servicesEnabled: true, shippingEnabled: true },
    { code: "NG", name: "Nigeria", currency: "NGN", phoneCode: "+234", timezone: "Africa/Lagos", addressFormat: { postalCodeRequired: false, regionLabel: "State" }, paymentProviders: ["paystack", "manual"], servicesEnabled: false, shippingEnabled: true },
    { code: "GB", name: "United Kingdom", currency: "GBP", phoneCode: "+44", timezone: "Europe/London", addressFormat: { postalCodeRequired: true, regionLabel: "County", postalLabel: "Postcode" }, paymentProviders: ["stripe", "paypal"], servicesEnabled: false, shippingEnabled: false },
    { code: "US", name: "United States", currency: "USD", phoneCode: "+1", timezone: "America/New_York", addressFormat: { postalCodeRequired: true, regionLabel: "State", postalLabel: "ZIP code" }, paymentProviders: ["stripe", "paypal"], servicesEnabled: false, shippingEnabled: false },
    { code: "IE", name: "Ireland", currency: "EUR", phoneCode: "+353", timezone: "Europe/Dublin", addressFormat: { postalCodeRequired: false, regionLabel: "County", postalLabel: "Eircode" }, paymentProviders: ["stripe", "paypal"], servicesEnabled: false, shippingEnabled: false },
  ]);
  const regions = await db
    .insert(schema.regions)
    .values([
      { countryCode: "GH", name: "Greater Accra" },
      { countryCode: "GH", name: "Ashanti" },
      { countryCode: "GH", name: "Central" },
      { countryCode: "GH", name: "Western" },
      { countryCode: "NG", name: "Lagos" },
      { countryCode: "NG", name: "FCT" },
    ])
    .returning();
  const rid = (n: string) => regions.find((r) => r.name === n)!.id;
  const cityRows: (typeof schema.cities.$inferInsert)[] = [
    ...["Accra Central", "East Legon", "Airport Residential", "Cantonments", "Spintex", "Adenta", "Dzorwulu", "Tema", "Labone", "Madina"].map((name) => ({ name, regionId: rid("Greater Accra"), countryCode: "GH", slug: slugify(name), serviceAvailable: true })),
    { name: "Kumasi", regionId: rid("Ashanti"), countryCode: "GH", slug: "kumasi", serviceAvailable: true },
    { name: "Cape Coast", regionId: rid("Central"), countryCode: "GH", slug: "cape-coast", serviceAvailable: false },
    { name: "Takoradi", regionId: rid("Western"), countryCode: "GH", slug: "takoradi", serviceAvailable: false },
    { name: "Lagos", regionId: rid("Lagos"), countryCode: "NG", slug: "lagos", serviceAvailable: false },
    { name: "Abuja", regionId: rid("FCT"), countryCode: "NG", slug: "abuja", serviceAvailable: false },
  ];
  const cities = await db.insert(schema.cities).values(cityRows).returning();
  const cid = (n: string) => cities.find((c) => c.name === n)!.id;
  const accraIds = cities.filter((c) => c.regionId === rid("Greater Accra")).map((c) => c.id);

  await db.insert(schema.taxConfigurations).values([
    { countryCode: "GH", name: "VAT (15%)", rateBps: 1500, scope: "all", inclusive: false },
    { countryCode: "GH", name: "NHIL (2.5%)", rateBps: 250, scope: "all", inclusive: false },
    { countryCode: "GH", name: "GETFund levy (2.5%)", rateBps: 250, scope: "all", inclusive: false },
    { countryCode: "NG", name: "VAT (7.5%)", rateBps: 750, scope: "products", inclusive: false },
    { countryCode: "GB", name: "VAT (20%)", rateBps: 2000, scope: "all", inclusive: true },
  ]);

  /* ---------------- Roles & permissions ---------------- */
  const perms = await db
    .insert(schema.permissions)
    .values(Object.entries(PERMISSIONS).map(([key, [group, description]]) => ({ key, group, description })))
    .returning();
  const roles = await db
    .insert(schema.roles)
    .values(Object.entries(DEFAULT_ROLES).map(([key, r]) => ({ key, name: r.name, description: r.description, system: !!r.system })))
    .returning();
  for (const r of roles) {
    const ps = DEFAULT_ROLES[r.key]!.permissions;
    if (ps.length) await db.insert(schema.rolePermissions).values(ps.map((p) => ({ roleId: r.id, permissionId: perms.find((x) => x.key === p)!.id })));
  }
  const roleId = (k: string) => roles.find((r) => r.key === k)!.id;

  /* ---------------- Notification templates ---------------- */
  await db.insert(schema.notificationTemplates).values(
    Object.entries(DEFAULT_TEMPLATES).map(([key, t]) => ({ key, name: t.name, subject: t.subject, body: t.body, sms: t.sms ?? null, channels: t.channels })),
  );

  /* ---------------- Services ---------------- */
  const cats = await db
    .insert(schema.serviceCategories)
    .values([
      { slug: "lawn-care", name: "Lawn mowing & maintenance", icon: "lawn", description: "Regular mowing, edging and lawn health care for homes and estates.", imageUrl: P(4162011), sort: 1 },
      { slug: "landscaping", name: "Landscaping", icon: "landscape", description: "Hardscaping, planting schemes, turf laying and outdoor installations.", imageUrl: P(15551712), sort: 2 },
      { slug: "garden-design", name: "Garden design", icon: "design", description: "Site surveys, planting plans and complete garden designs.", imageUrl: U("1558293842-c0fd3db86157"), sort: 3 },
      { slug: "tree-pruning", name: "Tree pruning", icon: "tree", description: "Pruning, hedge shaping, crown lifting and safe branch removal.", imageUrl: P(24595769), sort: 4 },
      { slug: "planting", name: "Planting & gardening", icon: "sprout", description: "Bed preparation, planting, potting and seasonal refreshes.", imageUrl: U("1530595467537-0b5996c41f2d"), sort: 5 },
      { slug: "garden-cleaning", name: "Garden cleaning", icon: "broom", description: "Leaf and debris clearance, green-waste removal and tidy-ups.", imageUrl: P(26827231), sort: 6 },
      { slug: "weed-removal", name: "Weed removal", icon: "weed", description: "Manual and targeted weed control for beds, lawns and paving.", imageUrl: P(11364122), sort: 7 },
      { slug: "irrigation", name: "Irrigation installation", icon: "droplet", description: "Sprinkler and drip systems designed, installed and repaired.", imageUrl: P(32974060), sort: 8 },
      { slug: "garden-maintenance", name: "Garden maintenance", icon: "shears", description: "Scheduled visits to keep beds, hedges and lawns in shape.", imageUrl: P(16229115), sort: 9 },
      { slug: "fertilizer", name: "Fertilizer application", icon: "flask", description: "Soil-appropriate feeding programmes for lawns, beds and trees.", imageUrl: P(25974981), sort: 10 },
      { slug: "consultation", name: "Garden consultation", icon: "clipboard", description: "On-site advice from an experienced horticulturist.", imageUrl: P(4920266), sort: 11 },
      { slug: "horticulture", name: "Horticultural services", icon: "leaf", description: "Plant health checks, pest and disease management, specialist care.", imageUrl: P(4894608), sort: 12 },
    ])
    .returning();
  const cat = (s: string) => cats.find((c) => c.slug === s)!.id;

  const svcDefs: (Omit<typeof schema.services.$inferInsert, "currency"> & { areas?: number[] })[] = [
    {
      slug: "standard-lawn-mowing", categoryId: cat("lawn-care"), name: "Standard lawn mowing", pricingModel: "per_sqm", basePrice: 150, minimumCharge: ghs(180), durationMinutes: 120, depositPercent: 100, featured: true,
      summary: "Mowing, edging and clipping collection for residential lawns.",
      description: "Our gardeners cut your lawn to the right height for the season, trim the edges along paths and beds, and take the clippings away. Priced by lawn area so you only pay for what we cut. Most lawns in Accra need a cut every two to three weeks during the rainy season.",
      images: [P(4162011), P(4162016), U("1558904541-efa843a96f01")], includes: ["Mowing at a season-appropriate height", "Edging along paths and beds", "Clippings bagged and removed", "Quick check for pests and bare patches"],
      requirements: "Please clear toys, hoses and furniture from the lawn before the visit. An outdoor tap is helpful but not required.",
    },
    {
      slug: "lawn-renovation", categoryId: cat("lawn-care"), name: "Lawn renovation & re-turfing", pricingModel: "inspection", basePrice: 0, minimumCharge: 0, durationMinutes: 480, depositPercent: 40,
      summary: "Bring tired or patchy lawns back with scarifying, overseeding or new turf.",
      description: "For lawns that have thinned out, been damaged by drought or overrun with weeds. We visit, test the soil and recommend scarifying and overseeding or full re-turfing with Paspalum or Bermuda grass suited to the Ghanaian climate. You receive a written quote after the inspection.",
      images: [U("1558904541-efa843a96f01"), U("1600585154340-be6161a56a0c")], includes: ["Site inspection and soil assessment", "Written quote with grass options", "Removal of old turf where needed", "Aftercare watering schedule"],
    },
    {
      slug: "landscape-installation", categoryId: cat("landscaping"), name: "Landscape & outdoor installation", pricingModel: "quote", basePrice: 0, minimumCharge: 0, durationMinutes: 480, depositPercent: 40, featured: true,
      summary: "Paths, beds, edging, turf and planting installed to plan.",
      description: "From a new front garden to a complete compound makeover. We handle paving and stepping-stone paths, raised beds, edging, turf, gravel areas and planting. Share photos and rough measurements and our team will send a detailed quote, usually within two working days.",
      images: [P(15551712), U("1600047509807-ba8f99d2cdde"), U("1585320806297-9794b3e4eeae")], includes: ["Project quote with itemised materials", "Groundwork and soil preparation", "Hardscaping and planting", "Clean-up and handover walkthrough"],
    },
    {
      slug: "garden-design-plan", categoryId: cat("garden-design"), name: "Garden design plan", pricingModel: "starting", basePrice: ghs(1500), minimumCharge: ghs(1500), durationMinutes: 180, depositPercent: 50, featured: true,
      summary: "A scaled planting and layout plan you can build yourself or with us.",
      description: "A designer visits, measures the space and talks through how you want to use it. You receive a scaled layout, a planting list chosen for sun, shade and local conditions, and a materials list. The starting price covers gardens up to 300 m²; larger or more complex sites are re-quoted before any extra work.",
      images: [U("1558293842-c0fd3db86157"), U("1557429287-b2e26467fc2b")], includes: ["On-site consultation and measurement", "Scaled layout drawing", "Planting list with care notes", "One round of revisions"],
    },
    {
      slug: "tree-and-hedge-pruning", categoryId: cat("tree-pruning"), name: "Tree & hedge pruning", pricingModel: "hourly", basePrice: ghs(120), minimumCharge: ghs(240), durationMinutes: 180, depositPercent: 30, featured: true,
      summary: "Shaping hedges, thinning crowns and removing dead or overhanging branches.",
      description: "Careful pruning keeps trees healthy and hedges dense. Our gardeners work with hand tools and powered trimmers, remove cut material and leave the area tidy. Trees above 6 metres or near power lines require an inspection first and are quoted separately.",
      images: [P(24595769), U("1617576683096-00fc8eecb3af"), P(24595771)], includes: ["Hedge shaping and trimming", "Removal of dead and crossing branches", "Green waste removed", "Pruning advice for the season"],
      requirements: "Tell us roughly how many trees or the length of hedge in the job details.",
    },
    {
      slug: "planting-service", categoryId: cat("planting"), name: "Bed preparation & planting", pricingModel: "per_sqm", basePrice: ghs(25), minimumCharge: ghs(300), durationMinutes: 240, depositPercent: 30,
      summary: "Soil preparation and planting of beds, borders and containers.",
      description: "We dig over and improve the soil with compost, then plant your chosen plants or ones we recommend for the spot. Plants can be bought from our shop or supplied by you. Price is per square metre of bed, plants not included.",
      images: [U("1530595467537-0b5996c41f2d"), P(7156447), U("1622383563227-04401ab4e5ea")], includes: ["Weeding and soil turning", "Compost incorporated", "Planting and first watering", "Mulch on request"],
    },
    {
      slug: "garden-clean-up", categoryId: cat("garden-cleaning"), name: "Garden clean-up", pricingModel: "fixed", basePrice: ghs(450), minimumCharge: 0, durationMinutes: 240, depositPercent: 30,
      summary: "A half-day tidy: leaves, debris, overgrowth and green waste removed.",
      description: "Ideal before an event, after a storm or when moving into a new home. Two gardeners spend up to four hours clearing leaves and debris, cutting back overgrowth, sweeping paths and taking green waste away.",
      images: [P(26827231), P(4079768)], includes: ["Two gardeners for up to 4 hours", "Leaf and debris clearance", "Cut-back of overgrowth", "Green waste removal (up to 1 truckload)"],
    },
    {
      slug: "weed-control", categoryId: cat("weed-removal"), name: "Weed control", pricingModel: "per_sqm", basePrice: ghs(4), minimumCharge: ghs(200), durationMinutes: 180, depositPercent: 30,
      summary: "Hand weeding and targeted treatment for beds, lawns and paving.",
      description: "Weeds are removed by hand from beds and borders, and spot-treated on lawns and paving where hand removal is not practical. We use products approved for residential use and keep them away from edible plants.",
      images: [P(11364122), P(16265609)], includes: ["Hand weeding of beds", "Spot treatment where suitable", "Weeds removed from site", "Advice on mulching to reduce regrowth"],
    },
    {
      slug: "irrigation-installation", categoryId: cat("irrigation"), name: "Irrigation system installation", pricingModel: "inspection", basePrice: 0, minimumCharge: 0, durationMinutes: 480, depositPercent: 50, featured: true,
      summary: "Sprinkler and drip systems designed for your garden and water supply.",
      description: "We survey your garden and water pressure, then design a sprinkler or drip system with a timer so plants are watered early in the morning without waste. Includes trenching, pipework, heads or drippers, controller set-up and a handover of how to adjust it.",
      images: [P(32974060), P(8443729)], includes: ["Site and water-pressure survey", "System design and quote", "Installation and controller set-up", "Six-month workmanship guarantee"],
    },
    {
      slug: "irrigation-repair", categoryId: cat("irrigation"), name: "Sprinkler & drip repair", pricingModel: "hourly", basePrice: ghs(150), minimumCharge: ghs(300), durationMinutes: 120, depositPercent: 30,
      summary: "Fix leaks, broken heads, blocked drippers and faulty timers.",
      description: "A technician diagnoses and repairs existing irrigation systems. Common parts are carried on the van; anything else is quoted before it is fitted.",
      images: [P(8443729), P(4870792)], includes: ["Diagnosis and pressure test", "Replacement of common parts", "Timer reprogramming"],
    },
    {
      slug: "monthly-garden-maintenance", categoryId: cat("garden-maintenance"), name: "Garden maintenance visit", pricingModel: "fixed", basePrice: ghs(350), minimumCharge: 0, durationMinutes: 180, depositPercent: 100, featured: true,
      summary: "A three-hour visit covering lawn, beds, hedges and general upkeep.",
      description: "One gardener spends three hours on whatever your garden needs most: mowing small lawns, weeding, trimming, deadheading, feeding pots and tidying. Many customers book a visit every two weeks.",
      images: [P(16229115), P(9324354), U("1598902108854-10e335adac99")], includes: ["One gardener for 3 hours", "Lawn, beds and hedges as needed", "Watering and feeding of pots", "Notes on anything that needs attention"],
    },
    {
      slug: "fertilizer-programme", categoryId: cat("fertilizer"), name: "Fertilizer application", pricingModel: "per_sqm", basePrice: ghs(3), minimumCharge: ghs(150), durationMinutes: 90, depositPercent: 100,
      summary: "The right feed for lawns, beds and trees, applied evenly.",
      description: "We apply granular or liquid fertilizer suited to your plants and the season, watered in to avoid scorching. Price includes standard NPK fertilizer; organic options are available on request.",
      images: [P(25974981), U("1416879595882-3373a0480b5b")], includes: ["Product selected for your plants", "Even application with spreader", "Watering in", "Feeding schedule recommendation"],
    },
    {
      slug: "garden-consultation", categoryId: cat("consultation"), name: "Garden consultation", pricingModel: "fixed", basePrice: ghs(300), minimumCharge: 0, durationMinutes: 60, depositPercent: 100,
      summary: "One hour on site with a horticulturist to answer your questions.",
      description: "Walk around your garden with an experienced horticulturist. Get advice on plant choice, problem areas, watering, pests and how to plan improvements. You receive a short written summary afterwards.",
      images: [P(4920266), P(9710826)], includes: ["One-hour site visit", "Plant and problem diagnosis", "Written summary with recommendations"],
    },
    {
      slug: "plant-health-treatment", categoryId: cat("horticulture"), name: "Pest & disease treatment", pricingModel: "starting", basePrice: ghs(250), minimumCharge: ghs(250), durationMinutes: 90, depositPercent: 50,
      summary: "Inspection and treatment for common pests and plant diseases.",
      description: "Mealybugs on hibiscus, fungal spots on roses, termites in mulch: we identify the problem and treat it with the least harmful effective option. The starting price covers inspection and treatment of a small garden; larger infestations are re-quoted before work begins.",
      images: [P(4894608), U("1597848212624-a19eb35e2651")], includes: ["Inspection and identification", "Targeted treatment", "Follow-up advice"],
    },
  ];
  const services = await db.insert(schema.services).values(svcDefs.map(({ areas: _a, ...s }) => ({ ...s, currency: "GHS" }))).returning();
  const svc = (slug: string) => services.find((s) => s.slug === slug)!;
  // Kumasi only has lawn, maintenance, pruning and clean-up for now; Accra has everything.
  const kumasiServices = ["standard-lawn-mowing", "monthly-garden-maintenance", "tree-and-hedge-pruning", "garden-clean-up", "weed-control"];
  for (const s of services) {
    const areas = [...accraIds, ...(kumasiServices.includes(s.slug) ? [cid("Kumasi")] : [])];
    await db.insert(schema.serviceAreas).values(areas.map((cityId) => ({ serviceId: s.id, cityId })));
  }

  await db.insert(schema.commissionRules).values([
    { name: "Default marketplace commission", rateBps: 1500 },
    { name: "Landscaping projects", serviceCategoryId: cat("landscaping"), rateBps: 1200 },
    { name: "Garden design", serviceCategoryId: cat("garden-design"), rateBps: 1000 },
  ]);

  /* ---------------- Commerce catalogue ---------------- */
  const [companyVendor] = await db.insert(schema.vendors).values({ name: "Home Gardens Store", slug: "home-gardens-store", email: "store@homegardens.example", isCompany: true, commissionBps: 0 }).returning();
  const [nursery] = await db.insert(schema.vendors).values({ name: "Aburi Hills Nursery", slug: "aburi-hills-nursery", email: "orders@aburihills.example", isCompany: false, commissionBps: 1500 }).returning();
  const brands = await db
    .insert(schema.brands)
    .values(["TerraPro", "AquaFlow", "GreenEdge", "Volta Clay", "SoilRich", "FieldGuard"].map((name) => ({ name, slug: slugify(name) })))
    .returning();
  const brand = (n: string) => brands.find((b) => b.name === n)!.id;
  const pcats = await db
    .insert(schema.productCategories)
    .values([
      ["gardening-tools", "Gardening tools", P(11397558)],
      ["lawn-mowers", "Lawn mowers", P(4162011)],
      ["grass-trimmers", "Grass trimmers", P(11400235)],
      ["watering-equipment", "Watering equipment", P(4501244)],
      ["irrigation-systems", "Irrigation systems", P(32974060)],
      ["seeds", "Seeds", P(7782153)],
      ["seedlings", "Seedlings & plants", U("1523348837708-15d4a09cfac2")],
      ["fertilizers", "Fertilizers", P(25974981)],
      ["pesticides", "Pest control", P(4894608)],
      ["soil-compost", "Soil & compost", P(7728382)],
      ["pots-planters", "Pots & planters", P(10011988)],
      ["garden-furniture", "Garden furniture", P(15800344)],
      ["protective-equipment", "Protective equipment", P(11397558)],
      ["landscaping-supplies", "Landscaping supplies", P(26827231)],
      ["accessories", "Gardening accessories", P(4870792)],
    ].map(([slug, name, imageUrl], i) => ({ slug: slug!, name: name!, imageUrl, sort: i })))
    .returning();
  const pcat = (s: string) => pcats.find((c) => c.slug === s)!.id;

  const [acc] = await db.insert(schema.warehouses).values({ code: "ACC-01", name: "Accra warehouse (Spintex)", address: "Spintex Road, Accra", countryCode: "GH", isDefault: true }).returning();
  const [ksi] = await db.insert(schema.warehouses).values({ code: "KSI-01", name: "Kumasi store", address: "Ahodwo, Kumasi", countryCode: "GH" }).returning();

  type V = { name: string; options: Record<string, string>; price?: number; stockAcc: number; stockKsi?: number };
  type Prod = Omit<typeof schema.products.$inferInsert, "currency" | "vendorId" | "sku"> & { sku: string; vendor?: "nursery"; variants?: V[]; stockAcc?: number; stockKsi?: number };
  const prods: Prod[] = [
    { slug: "rotary-petrol-lawn-mower-46", sku: "MOW-46P", name: "46 cm petrol rotary lawn mower", categoryId: pcat("lawn-mowers"), brandId: brand("TerraPro"), price: ghs(5850), salePrice: ghs(5400), featured: true, weightGrams: 28000, stockAcc: 6, stockKsi: 2,
      summary: "Self-propelled 4-stroke mower for medium to large lawns.", description: "A reliable 139 cc four-stroke engine with recoil start, a 46 cm steel deck and a 55-litre grass box. Seven cutting heights from 25 to 75 mm make it easy to adapt to Paspalum, Bermuda or Zoysia lawns through the rainy and dry seasons.",
      images: [P(4162011), P(4162016)], specs: { "Cutting width": "46 cm", Engine: "139 cc 4-stroke", "Cutting heights": "7 positions, 25–75 mm", "Grass box": "55 L", Drive: "Self-propelled", Warranty: "12 months" } },
    { slug: "electric-lawn-mower-38", sku: "MOW-38E", name: "38 cm electric lawn mower", categoryId: pcat("lawn-mowers"), brandId: brand("TerraPro"), price: ghs(2650), weightGrams: 12000, stockAcc: 10, stockKsi: 3,
      summary: "Light corded mower for small compounds and townhouse lawns.", description: "A 1,600 W motor, 38 cm cut and lightweight body make this mower easy to push and store. Ideal for lawns up to 300 m² with an outdoor socket nearby.",
      images: [P(4162016)], specs: { "Cutting width": "38 cm", Power: "1,600 W", "Grass box": "40 L", Cable: "10 m", Warranty: "12 months" } },
    { slug: "cordless-grass-trimmer", sku: "TRM-20V", name: "Cordless grass trimmer 20 V", categoryId: pcat("grass-trimmers"), brandId: brand("GreenEdge"), price: ghs(1450), featured: true, weightGrams: 3200, stockAcc: 14, stockKsi: 4,
      summary: "Battery trimmer for edges, fence lines and tight corners.", description: "Comes with a 4 Ah battery and charger. The rotating head switches between trimming and edging, and the telescopic shaft adjusts to your height. Runs for about 40 minutes on a charge.",
      images: [P(11400235), P(16265609)], specs: { Voltage: "20 V", Battery: "4.0 Ah (included)", "Cutting diameter": "30 cm", Runtime: "Up to 40 min", Weight: "3.2 kg" } },
    { slug: "petrol-brush-cutter", sku: "TRM-52P", name: "52 cc petrol brush cutter", categoryId: pcat("grass-trimmers"), brandId: brand("GreenEdge"), price: ghs(2350), weightGrams: 8500, stockAcc: 5,
      summary: "Heavy-duty brush cutter for overgrown plots and verges.", description: "Supplied with both a nylon line head and a three-tooth blade for thick grass and light brush. Includes a double shoulder harness to spread the weight.",
      images: [P(11364122)], specs: { Engine: "52 cc 2-stroke", Heads: "Line head + 3T blade", Harness: "Double shoulder", Weight: "8.5 kg" } },
    { slug: "hedge-trimmer-cordless", sku: "HDG-60C", name: "Cordless hedge trimmer 60 cm", categoryId: pcat("gardening-tools"), brandId: brand("GreenEdge"), price: ghs(1680), weightGrams: 3000, stockAcc: 8,
      summary: "Dual-action 60 cm blade for clean cuts on hedges and shrubs.", description: "Laser-cut blades with 20 mm tooth spacing handle ficus, duranta and bougainvillea hedges. Uses the same 20 V battery as our grass trimmer.",
      images: [P(24595769), P(24595771)], specs: { "Blade length": "60 cm", "Tooth gap": "20 mm", Battery: "20 V (sold separately)", Weight: "3.0 kg" } },
    { slug: "bypass-pruning-shears", sku: "TL-PRN-01", name: "Bypass pruning shears", categoryId: pcat("gardening-tools"), brandId: brand("TerraPro"), price: ghs(185), featured: true, weightGrams: 250, stockAcc: 60, stockKsi: 20,
      summary: "Hardened steel secateurs for live stems up to 20 mm.", description: "Precision-ground bypass blades make clean cuts that heal quickly. Non-slip grips and a safety lock that works with one hand.",
      images: [P(4270181), U("1617576683096-00fc8eecb3af")], specs: { "Cutting capacity": "20 mm", Blade: "SK5 hardened steel", Length: "21 cm" } },
    { slug: "garden-tool-set-5-piece", sku: "TL-SET-05", name: "5-piece hand tool set", categoryId: pcat("gardening-tools"), brandId: brand("TerraPro"), price: ghs(320), weightGrams: 1600, stockAcc: 30, stockKsi: 10,
      summary: "Trowel, transplanter, cultivator, weeder and pruner in a canvas bag.", description: "Everything you need for pots and raised beds. Stainless steel heads with comfortable hardwood handles.",
      images: [P(11397558), U("1416879595882-3373a0480b5b")], specs: { Pieces: "5 + storage bag", Material: "Stainless steel, hardwood" } },
    { slug: "expandable-garden-hose-30m", sku: "WT-HOSE-30", name: "Garden hose with 7-pattern nozzle", categoryId: pcat("watering-equipment"), brandId: brand("AquaFlow"), price: ghs(420), weightGrams: 2500, stockAcc: 25, stockKsi: 8,
      variants: [{ name: "15 m", options: { Length: "15 m" }, price: ghs(290), stockAcc: 18, stockKsi: 6 }, { name: "30 m", options: { Length: "30 m" }, stockAcc: 12, stockKsi: 4 }],
      summary: "Kink-resistant hose with brass fittings and a spray nozzle.", description: "UV-stabilised reinforced PVC that stays flexible in the sun. Supplied with quick connectors and a 7-pattern spray nozzle.",
      images: [P(17335757), P(4870792), P(16229115)], specs: { Material: "Reinforced PVC", Fittings: "Brass quick-connect", Nozzle: "7 patterns" } },
    { slug: "metal-watering-can-9l", sku: "WT-CAN-09", name: "Galvanised watering can 9 L", categoryId: pcat("watering-equipment"), brandId: brand("AquaFlow"), price: ghs(240), weightGrams: 1400, stockAcc: 22,
      summary: "Classic long-spout can with a removable rose.", description: "Rust-resistant galvanised steel with a balanced handle for easy pouring. The brass rose gives a gentle shower for seedlings.",
      images: [P(4750270), P(4501244)], specs: { Capacity: "9 L", Material: "Galvanised steel" } },
    { slug: "pop-up-sprinkler-kit", sku: "IRR-POP-KIT", name: "Pop-up sprinkler starter kit", categoryId: pcat("irrigation-systems"), brandId: brand("AquaFlow"), price: ghs(1250), featured: true, weightGrams: 4000, stockAcc: 9,
      summary: "Six pop-up heads, pipe, fittings and a battery tap timer.", description: "Covers up to 120 m² of lawn. Heads retract flush with the turf so they are safe to mow over. Our team can install it for you – book irrigation installation.",
      images: [P(32974060), P(8443729)], specs: { Heads: "6 adjustable pop-up", Coverage: "Up to 120 m²", Timer: "Battery tap timer", Pipe: "20 m 16 mm LDPE" } },
    { slug: "drip-irrigation-kit", sku: "IRR-DRIP-50", name: "Drip irrigation kit for 50 plants", categoryId: pcat("irrigation-systems"), brandId: brand("AquaFlow"), price: ghs(680), weightGrams: 2000, stockAcc: 15,
      summary: "Water beds and pots at the root with less waste.", description: "Includes 25 m of distribution pipe, 50 adjustable drippers, stakes, connectors and a pressure reducer for mains or tank supply.",
      images: [P(4207906)], specs: { Drippers: "50 adjustable", Pipe: "25 m", "Suitable for": "Beds, pots, vegetable gardens" } },
    { slug: "vegetable-seed-collection", sku: "SD-VEG-COL", name: "Vegetable seed collection", categoryId: pcat("seeds"), brandId: brand("SoilRich"), price: ghs(95), featured: true, weightGrams: 120, stockAcc: 80, stockKsi: 30,
      variants: [
        { name: "Tomato & pepper", options: { Mix: "Tomato & pepper" }, stockAcc: 30, stockKsi: 10 },
        { name: "Leafy greens", options: { Mix: "Leafy greens" }, stockAcc: 30, stockKsi: 10 },
        { name: "Herbs", options: { Mix: "Herbs" }, price: ghs(85), stockAcc: 20, stockKsi: 10 },
      ],
      summary: "Packs of tested seed varieties that do well in Ghanaian gardens.", description: "Each collection contains four varieties selected for heat tolerance and disease resistance, with sowing instructions for the rainy and dry seasons.",
      images: [P(7782153), U("1523348837708-15d4a09cfac2")], specs: { Varieties: "4 per pack", "Germination tested": "Yes" } },
    { slug: "assorted-seedling-tray", sku: "SL-TRAY-24", name: "Seedling tray (24 plants)", categoryId: pcat("seedlings"), price: ghs(160), weightGrams: 3000, vendor: "nursery", stockAcc: 20,
      variants: [{ name: "Vegetables", options: { Type: "Vegetables" }, stockAcc: 12 }, { name: "Flowering bedding", options: { Type: "Flowering" }, price: ghs(190), stockAcc: 8 }],
      summary: "Healthy nursery-raised seedlings ready to plant out.", description: "Grown at Aburi Hills Nursery and delivered in Greater Accra within two days of order. Plant within a week of delivery for best results.",
      images: [U("1523348837708-15d4a09cfac2"), U("1466692476868-aef1dfb1e735"), U("1615671524827-c1fe3973b648")], specs: { Quantity: "24 plants", "Delivery area": "Greater Accra only" } },
    { slug: "peace-lily-potted", sku: "SL-PLILY", name: "Peace lily in 20 cm pot", categoryId: pcat("seedlings"), price: ghs(140), weightGrams: 2500, vendor: "nursery", stockAcc: 15,
      summary: "A forgiving indoor plant with glossy leaves and white blooms.", description: "Thrives in bright indirect light and tells you when it needs water by drooping slightly. Supplied in a black nursery pot – pair it with one of our ceramic planters.",
      images: [U("1595351298020-038700609878")], specs: { Height: "40–50 cm", Pot: "20 cm nursery pot", Light: "Bright, indirect" } },
    { slug: "npk-15-15-15", sku: "FRT-NPK-15", name: "NPK 15-15-15 fertilizer", categoryId: pcat("fertilizers"), brandId: brand("SoilRich"), price: ghs(110), featured: true, weightGrams: 5000, stockAcc: 50, stockKsi: 20,
      variants: [{ name: "5 kg", options: { Weight: "5 kg" }, stockAcc: 35, stockKsi: 15 }, { name: "25 kg", options: { Weight: "25 kg" }, price: ghs(420), stockAcc: 15, stockKsi: 5 }],
      summary: "Balanced granular feed for lawns, beds and vegetables.", description: "Equal parts nitrogen, phosphorus and potassium for steady growth, root development and flowering. Apply 30–50 g per m² and water in.",
      images: [P(25974981)], specs: { Analysis: "15-15-15", Form: "Granular", Rate: "30–50 g/m²" } },
    { slug: "organic-compost", sku: "SOIL-COMP-40", name: "Organic compost 40 L", categoryId: pcat("soil-compost"), brandId: brand("SoilRich"), price: ghs(75), weightGrams: 18000, stockAcc: 70, stockKsi: 25,
      summary: "Well-rotted compost to improve sandy and clay soils.", description: "Made from composted green waste and poultry manure, screened and matured for 12 weeks. Dig into beds or use as a top-dressing for lawns.",
      images: [P(5503338), U("1416879595882-3373a0480b5b")], specs: { Volume: "40 L", Source: "Green waste and poultry manure" } },
    { slug: "potting-mix", sku: "SOIL-POT-20", name: "Premium potting mix 20 L", categoryId: pcat("soil-compost"), brandId: brand("SoilRich"), price: ghs(65), weightGrams: 9000, stockAcc: 60, stockKsi: 20,
      summary: "Free-draining mix for containers and seed trays.", description: "Coco peat, compost and perlite with slow-release feed for the first six weeks.",
      images: [P(7728382)], specs: { Volume: "20 L", Contains: "Coco peat, compost, perlite, slow-release feed" } },
    { slug: "neem-oil-spray", sku: "PST-NEEM-1L", name: "Neem oil pest spray 1 L", categoryId: pcat("pesticides"), brandId: brand("FieldGuard"), price: ghs(85), weightGrams: 1100, stockAcc: 40,
      summary: "Plant-based spray for aphids, mealybugs and whitefly.", description: "Cold-pressed neem oil ready-to-use formula. Spray in the early morning or evening, covering the undersides of leaves. Repeat every 7 days.",
      images: [P(4894608)], specs: { Volume: "1 L ready to use", "Active ingredient": "Neem oil (azadirachtin)" } },
    { slug: "knapsack-sprayer-16l", sku: "PST-KNAP-16", name: "Knapsack sprayer 16 L", categoryId: pcat("pesticides"), brandId: brand("FieldGuard"), price: ghs(380), weightGrams: 4500, stockAcc: 12,
      summary: "Manual pressure sprayer for treating larger gardens.", description: "Adjustable brass nozzle, padded straps and a lockable trigger. Rinse after each use.",
      images: [P(4894608)], specs: { Capacity: "16 L", Nozzle: "Adjustable brass", Pressure: "Up to 4 bar" } },
    { slug: "terracotta-pot", sku: "POT-TC", name: "Handmade terracotta pot", categoryId: pcat("pots-planters"), brandId: brand("Volta Clay"), price: ghs(85), featured: true, weightGrams: 4000, stockAcc: 45, stockKsi: 15,
      variants: [
        { name: "25 cm", options: { Diameter: "25 cm" }, stockAcc: 20, stockKsi: 6 },
        { name: "35 cm", options: { Diameter: "35 cm" }, price: ghs(140), stockAcc: 15, stockKsi: 5 },
        { name: "45 cm", options: { Diameter: "45 cm" }, price: ghs(220), stockAcc: 10, stockKsi: 4 },
      ],
      summary: "Breathable clay pots thrown by potters in the Volta Region.", description: "Unglazed terracotta lets roots breathe and helps prevent waterlogging. Each pot has a drainage hole and small variations from being made by hand.",
      images: [P(10011988), P(33926932), P(33926935)], specs: { Material: "Unglazed terracotta", Drainage: "Yes", Origin: "Volta Region, Ghana" } },
    { slug: "ceramic-planter-white", sku: "POT-CER-W", name: "Glazed ceramic planter", categoryId: pcat("pots-planters"), brandId: brand("Volta Clay"), price: ghs(210), weightGrams: 3500, stockAcc: 20,
      summary: "A clean, glazed planter for indoor plants.", description: "Glazed inside and out with a cork drainage plug, so it works indoors with a saucer or outdoors with the plug removed.",
      images: [U("1485955900006-10f4d324d411"), U("1509423350716-97f9360b4e09")], specs: { Diameter: "22 cm", Finish: "Gloss glaze" } },
    { slug: "bistro-garden-set", sku: "FUR-BIS-3", name: "3-piece bistro garden set", categoryId: pcat("garden-furniture"), brandId: brand("TerraPro"), price: ghs(2400), weightGrams: 22000, stockAcc: 4, allowBackorder: true,
      summary: "Powder-coated steel table and two chairs for patios and balconies.", description: "Weather-resistant steel with a powder-coat finish that stands up to sun and rain. The chairs stack for storage.",
      images: [P(15800344)], specs: { Pieces: "Table + 2 chairs", Material: "Powder-coated steel", "Table diameter": "60 cm" } },
    { slug: "gardening-gloves", sku: "PPE-GLV", name: "Nitrile-coated gardening gloves", categoryId: pcat("protective-equipment"), brandId: brand("FieldGuard"), price: ghs(45), weightGrams: 100, stockAcc: 100, stockKsi: 40,
      variants: [{ name: "Medium", options: { Size: "M" }, stockAcc: 50, stockKsi: 20 }, { name: "Large", options: { Size: "L" }, stockAcc: 50, stockKsi: 20 }],
      summary: "Breathable gloves with a grippy, puncture-resistant palm.", description: "Knitted backs keep hands cool in the heat while the nitrile palm protects against thorns and soil.",
      images: [P(11397558)], specs: { Coating: "Nitrile palm", Washable: "Yes" } },
    { slug: "steel-wheelbarrow", sku: "LSC-WB-85", name: "Steel wheelbarrow 85 L", categoryId: pcat("landscaping-supplies"), brandId: brand("TerraPro"), price: ghs(650), weightGrams: 16000, stockAcc: 10,
      summary: "Heavy-gauge tray with a puncture-proof wheel.", description: "Moves soil, compost and green waste around the garden. The solid wheel never goes flat.",
      images: [P(26827231)], specs: { Capacity: "85 L", Wheel: "Puncture-proof solid" } },
  ];
  const warehouseStock: { variantId: string; warehouseId: number; qty: number }[] = [];
  for (const p of prods) {
    const { variants, stockAcc, stockKsi, vendor, ...rest } = p;
    const [row] = await db.insert(schema.products).values({ ...rest, currency: "GHS", vendorId: vendor === "nursery" ? nursery!.id : companyVendor!.id }).returning();
    const vs: V[] = variants ?? [{ name: "Default", options: {}, stockAcc: stockAcc ?? 0, stockKsi }];
    for (let i = 0; i < vs.length; i++) {
      const v = vs[i]!;
      const [vr] = await db
        .insert(schema.productVariants)
        .values({ productId: row!.id, sku: variants ? `${p.sku}-${slugify(v.name).toUpperCase()}` : p.sku, name: v.name, options: v.options, priceOverride: v.price ?? null, isDefault: i === 0 })
        .returning();
      warehouseStock.push({ variantId: vr!.id, warehouseId: acc!.id, qty: v.stockAcc });
      if (v.stockKsi) warehouseStock.push({ variantId: vr!.id, warehouseId: ksi!.id, qty: v.stockKsi });
    }
  }
  for (const s of warehouseStock) {
    await db.insert(schema.inventory).values({ variantId: s.variantId, warehouseId: s.warehouseId, onHand: s.qty });
    await db.insert(schema.inventoryMovements).values({ variantId: s.variantId, warehouseId: s.warehouseId, delta: s.qty, balanceAfter: s.qty, reason: "initial", note: "Opening stock" });
  }

  /* ---------------- Delivery ---------------- */
  const [zAccra] = await db.insert(schema.shippingZones).values({ name: "Greater Accra", countryCode: "GH", cityIds: accraIds }).returning();
  const [zKumasi] = await db.insert(schema.shippingZones).values({ name: "Kumasi", countryCode: "GH", cityIds: [cid("Kumasi")] }).returning();
  const [zGhana] = await db.insert(schema.shippingZones).values({ name: "Rest of Ghana", countryCode: "GH", cityIds: [cid("Cape Coast"), cid("Takoradi")] }).returning();
  const [zNg] = await db.insert(schema.shippingZones).values({ name: "Nigeria", countryCode: "NG", cityIds: [] }).returning();
  await db.insert(schema.deliveryMethods).values([
    { zoneId: zAccra!.id, name: "Standard delivery (1–2 days)", type: "flat", price: ghs(35), currency: "GHS", freeOver: ghs(1000), minDays: 1, maxDays: 2 },
    { zoneId: zAccra!.id, name: "Same-day delivery (order by 11am)", type: "flat", price: ghs(80), currency: "GHS", minDays: 0, maxDays: 0 },
    { zoneId: zAccra!.id, name: "Collect from Spintex warehouse", type: "pickup", price: 0, currency: "GHS", minDays: 0, maxDays: 1 },
    { zoneId: zKumasi!.id, name: "Standard delivery (1–3 days)", type: "flat", price: ghs(40), currency: "GHS", freeOver: ghs(1000), minDays: 1, maxDays: 3 },
    { zoneId: zKumasi!.id, name: "Collect from Kumasi store", type: "pickup", price: 0, currency: "GHS", minDays: 0, maxDays: 1 },
    { zoneId: zGhana!.id, name: "Courier (2–5 days)", type: "weight", price: ghs(60), pricePerKg: ghs(6), currency: "GHS", minDays: 2, maxDays: 5 },
    { zoneId: zNg!.id, name: "International courier (5–10 days)", type: "weight", price: ghs(450), pricePerKg: ghs(45), currency: "GHS", minDays: 5, maxDays: 10 },
  ]);


  /* ---------------- CMS ---------------- */
  await db.insert(schema.websiteContent).values([
    { key: "home.hero", value: { eyebrow: "Home Gardens", title: "We take care of your home garden", subtitle: "We design, maintain and care for gardens across Accra and Kumasi – with vetted gardeners, clear prices and supplies delivered to your door.", image: P(5529587), primaryLabel: "Our services", secondaryLabel: "Shop supplies" } },
    { key: "home.promo", value: { title: "Rainy season lawn plan", body: "Book three fortnightly mowing visits and get your fertilizer application free. Available in Greater Accra until the end of the season.", image: U("1558904541-efa843a96f01"), ctaLabel: "See lawn services", ctaHref: "/services?category=lawn-care", active: !minimal } },
    { key: "site.announcement", value: { text: "Free delivery in Greater Accra on shop orders over GH₵1,000", active: true } },
    { key: "seo.default", value: { title: "Home Gardens – Gardeners, garden supplies and workshops in Ghana", description: "Book vetted gardeners for lawn care, landscaping, pruning and irrigation, buy gardening tools and plants, and register for garden workshops in Accra and Kumasi." } },
  ]);
  await db.insert(schema.faqs).values([
    { category: "Bookings", question: "How do I know what a service will cost?", answer: "Fixed and area-based services show the price before you book. Larger jobs such as landscaping or irrigation are quoted after you share photos or after a site inspection – you only pay once you accept the quote.", sort: 1 },
    { category: "Bookings", question: "Can I choose my gardener?", answer: "Yes. You can pick a specific gardener when booking, or let us match you with the best available gardener for the service, location and time.", sort: 2 },
    { category: "Bookings", question: "What is your cancellation policy?", answer: "Cancel at least 24 hours before your booking for a full refund. Later cancellations keep 20% of the booking value to cover the gardener's reserved time.", sort: 3 },
    { category: "Bookings", question: "What if I'm not happy with the work?", answer: "When your gardener marks a job complete you'll see their photos. If something is not right, choose 'Report a problem' instead of confirming and our support team will step in before any payment is released to the gardener.", sort: 4 },
    { category: "Payments", question: "Which payment methods do you accept?", answer: "In Ghana you can pay with Mobile Money (MTN, Telecel, AirtelTigo) and cards through our payment partners, or by bank transfer. International customers can pay by card or PayPal where available.", sort: 5 },
    { category: "Payments", question: "Do I pay everything upfront?", answer: "Some services take a deposit when you book and the balance before you confirm completion. The amount due is always shown before you pay.", sort: 6 },
    { category: "Shop", question: "Where do you deliver?", answer: "We deliver across Greater Accra and Kumasi within 1–3 days, to other Ghanaian cities by courier, and to Nigeria by international courier. Live plants and seedlings are delivered in Greater Accra only.", sort: 7 },
    { category: "Shop", question: "Can I return a product?", answer: "Unused products can be returned within 14 days of delivery. Request a return from your order page and we'll arrange collection.", sort: 8 },
    { category: "Gardeners", question: "How are gardeners vetted?", answer: "Independent gardeners submit identity documents, experience and portfolio photos. Our team verifies documents and reviews each application before the profile goes live. Company gardeners are employed and trained by us.", sort: 9 },
    { category: "Gardeners", question: "How do independent gardeners get paid?", answer: "Earnings from completed jobs, less the platform commission, become available after a short holding period. Gardeners request payouts to Mobile Money or a bank account from their dashboard.", sort: 10 },
  ]);
  await db.insert(schema.pages).values([
    { slug: "terms", title: "Terms of service", body: "These terms govern use of the Home Gardens website and services.\n\n## Bookings\nA booking is confirmed once the required payment is received. Prices shown include applicable taxes unless stated otherwise.\n\n## Cancellations\nCancellations made at least 24 hours before the scheduled start receive a full refund. Later cancellations incur a fee of 20% of the booking value.\n\n## Shop orders\nOrders are dispatched once payment is confirmed. Unused items may be returned within 14 days of delivery.\n\n## Independent gardeners\nIndependent gardeners are self-employed service providers who agree to our gardener terms, including our commission and payout schedule.\n\n*Replace this page with terms reviewed by your legal adviser before launch.*" },
    { slug: "privacy", title: "Privacy policy", body: "We collect the information needed to provide our services: your contact details, addresses, booking and order history, and payment records. Identity documents submitted by gardeners are stored privately and only accessible to authorised staff.\n\nWe never store full card details – payments are processed by our payment partners.\n\nYou can request a copy or deletion of your data by contacting us.\n\n*Replace this page with a policy reviewed against the Ghana Data Protection Act, 2012 (Act 843) and any other laws that apply to you before launch.*" },
  ]);
  await db.insert(schema.systemSettings).values([{ key: "company", value: { name: "Home Gardens" } }]);

  console.log("Reference data seeded.");
  if (minimal) {
    await createAdmin(roleId("super_admin"));
    return;
  }

  /* ================================================================= */
  /* Demo content                                                       */
  /* ================================================================= */
  const pw = await hashPassword(process.env.SEED_DEMO_PASSWORD || "Garden2026!");
  const mkUser = async (email: string, fullName: string, role: string, extra: Partial<typeof schema.users.$inferInsert> = {}) => {
    const [u] = await db
      .insert(schema.users)
      .values({ email, fullName, passwordHash: pw, countryCode: "GH", preferredCurrency: "GHS", emailVerifiedAt: new Date(), phone: "+233 24 000 0000", ...extra })
      .returning();
    await db.insert(schema.userRoles).values({ userId: u!.id, roleId: roleId(role) });
    return u!;
  };

  await db.insert(schema.coupons).values([
    { code: "WELCOME10", description: "10% off your first shop order", type: "percent", value: 10, scope: "products", perUserLimit: 1 },
    { code: "GARDEN50", description: "GH₵50 off services over GH₵300", type: "fixed", value: ghs(50), currency: "GHS", scope: "services", minSubtotal: ghs(300), perUserLimit: 1, maxUses: 500 },
  ]);

  /* ---------------- Activities ---------------- */
  const activityDefs = [
    { slug: "container-vegetable-workshop", title: "Grow vegetables in containers", type: "workshop", price: ghs(250), cap: 16, featured: true, img: [P(9721352), P(7156447)], venue: "Home Gardens Learning Garden", address: "12 Lagos Avenue, East Legon", city: "East Legon",
      summary: "A hands-on Saturday morning workshop on growing tomatoes, peppers and greens in pots.",
      description: "Learn which vegetables do well in containers, how to mix a good potting medium, when to sow in the Accra climate and how to keep pests away without harsh chemicals. You will pot up your own pepper plant and take it home.\n\nAll materials, tea and light refreshments are included.",
      requirements: "Wear clothes you don't mind getting soil on. Suitable for ages 14+.", weekday: 6, hour: 9, dur: 3 },
    { slug: "aburi-botanical-garden-tour", title: "Guided tour of Aburi Botanical Gardens", type: "tour", price: ghs(180), cap: 25, featured: true, img: [U("1585320806297-9794b3e4eeae"), U("1558293842-c0fd3db86157")], venue: "Aburi Botanical Gardens", address: "Aburi, Eastern Region (bus departs East Legon)", city: "East Legon",
      summary: "A morning walk through one of West Africa's oldest botanical gardens with a horticulturist.",
      description: "Our horticulturist leads a two-hour walk through the palm avenue, spice garden and medicinal plant collection, explaining how to bring ideas home to your own garden. Transport from East Legon is included.",
      requirements: "Comfortable walking shoes and a water bottle.", weekday: 0, hour: 8, dur: 5 },
    { slug: "kids-garden-club", title: "Kids' garden club", type: "family", price: ghs(120), cap: 20, img: [U("1611735341450-74d61e660ad2"), P(5529587)], venue: "Home Gardens Learning Garden", address: "12 Lagos Avenue, East Legon", city: "East Legon",
      summary: "Planting, bug hunts and seed experiments for children aged 6–12.",
      description: "A fun two-hour session where children sow seeds, learn what plants need and plant something to take home. Parents are welcome to stay in the garden café.",
      requirements: "For ages 6–12. A parent or guardian must sign the child in and out.", weekday: 6, hour: 14, dur: 2 },
    { slug: "pruning-masterclass", title: "Pruning masterclass: hedges and fruit trees", type: "lesson", price: ghs(300), cap: 12, img: [U("1617576683096-00fc8eecb3af"), P(24595769)], venue: "Home Gardens Learning Garden", address: "12 Lagos Avenue, East Legon", city: "East Legon",
      summary: "Learn where and when to cut for healthier hedges, mangoes and citrus.",
      description: "A practical class covering tool care, formative pruning of young trees, renovation of overgrown hedges and the timing that suits our two rainy seasons. Each participant practises on our demonstration hedges.",
      requirements: "Bring your own secateurs if you have them; tools are provided otherwise.", weekday: 6, hour: 9, dur: 3 },
    { slug: "community-tree-planting", title: "Community tree planting day", type: "community", price: 0, cap: 60, featured: true, img: [P(5029929), P(9721356)], venue: "Achimota Forest edge, Accra", address: "Meeting point: Achimota Forest main gate", city: "Accra Central",
      summary: "Join neighbours to plant native shade trees. Free, with tools provided.",
      description: "We are planting 300 native trees including mahogany, wawa and shea along the forest edge. Gloves, tools, water and lunch are provided. Registration is free but required so we can plan tools and food.",
      requirements: "Closed shoes are required. Under-16s must attend with an adult.", weekday: 6, hour: 7, dur: 4 },
    { slug: "corporate-garden-day", title: "Corporate team garden day", type: "corporate", price: ghs(450), cap: 30, img: [P(9721352)], venue: "Home Gardens Learning Garden", address: "12 Lagos Avenue, East Legon", city: "East Legon",
      summary: "A half-day team activity building raised beds and planting a kitchen garden.",
      description: "Teams work together to build and plant raised beds, guided by our gardeners, followed by a lunch made with garden produce. Ideal for team building and CSR days. Price is per person; contact us for groups larger than 30.",
      requirements: "Minimum booking 6 people per company.", weekday: 5, hour: 9, dur: 4 },
  ];
  const now = new Date();
  for (const a of activityDefs) {
    const [row] = await db
      .insert(schema.activities)
      .values({
        slug: a.slug, title: a.title, type: a.type, summary: a.summary, description: a.description, images: a.img, organizer: "Home Gardens",
        venue: a.venue, address: a.address, cityId: cid(a.city), countryCode: "GH", price: a.price, currency: "GHS", defaultCapacity: a.cap,
        requirements: a.requirements, recurrence: a.type === "family" ? "weekly" : "none", requiresPayment: a.price > 0, featured: !!a.featured,
        maxPerBooking: a.type === "corporate" ? 30 : 6,
      })
      .returning();
    // next 3 sessions on the activity's weekday, 2-6 weeks out (UTC == Accra time)
    const sessions = [];
    for (let w = 0; w < 3; w++) {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
      d.setUTCDate(d.getUTCDate() + ((a.weekday - d.getUTCDay() + 7) % 7) + 7 * (w + 1) + (a.type === "community" ? 7 : 0));
      d.setUTCHours(a.hour, 0, 0, 0);
      sessions.push({ activityId: row!.id, startsAt: d, endsAt: new Date(d.getTime() + a.dur * 3600_000), capacity: a.cap });
    }
    await db.insert(schema.activitySessions).values(sessions);
  }


  const admin = await mkUser("admin@homegardens.example", "Esi Owusu", "super_admin");
  await db.insert(schema.staffProfiles).values({ userId: admin.id, employeeId: "HG-0001", department: "Management", jobTitle: "Operations director" });
  const ops = await mkUser("ops@homegardens.example", "Kofi Asante", "operations");
  await db.insert(schema.staffProfiles).values({ userId: ops.id, employeeId: "HG-0002", department: "Operations", jobTitle: "Bookings coordinator" });
  const fin = await mkUser("finance@homegardens.example", "Abena Mensah", "finance");
  await db.insert(schema.staffProfiles).values({ userId: fin.id, employeeId: "HG-0003", department: "Finance", jobTitle: "Finance officer" });
  const store = await mkUser("store@homegardens.example", "Yaw Boateng", "store_manager");
  await db.insert(schema.staffProfiles).values({ userId: store.id, employeeId: "HG-0004", department: "Store", jobTitle: "Store manager" });
  const customer = await mkUser("ama@example.com", "Ama Darko", "customer", { phone: "+233 24 555 0101" });
  await db.insert(schema.customerProfiles).values({ userId: customer.id });
  await db.insert(schema.addresses).values({ userId: customer.id, label: "Home", recipient: "Ama Darko", phone: "+233 24 555 0101", line1: "14 Boundary Road", city: "East Legon", cityId: cid("East Legon"), region: "Greater Accra", digitalAddress: "GA-492-7781", countryCode: "GH", isDefault: true });

  type G = { email: string; name: string; type: "company" | "independent"; status?: "approved" | "pending"; avatar: string; headline: string; bio: string; years: number; base: string; areas: string[]; services: string[]; rate?: number; quals?: string; portfolio: string[]; employeeId?: string };
  const gardeners: G[] = [
    { email: "kwame.mensah@homegardens.example", name: "Kwame Mensah", type: "company", avatar: P(9710826, 600), headline: "Senior gardener · lawns & landscaping", years: 11, base: "East Legon", areas: ["Airport Residential", "Cantonments", "Dzorwulu", "Labone", "Adenta", "Madina"], services: ["standard-lawn-mowing", "lawn-renovation", "landscape-installation", "monthly-garden-maintenance", "planting-service", "garden-clean-up", "weed-control"],
      bio: "Kwame has looked after lawns and compounds across East Legon and Cantonments for over a decade. He leads our landscaping crew and trains new gardeners on turf care and planting.", quals: "Certificate in Horticulture, Kwadaso Agricultural College", portfolio: [P(15551712), U("1598902108854-10e335adac99")], employeeId: "HG-G-101" },
    { email: "akosua.agyeman@homegardens.example", name: "Akosua Agyeman", type: "company", avatar: U("1611432579699-484f7990b127", 600), headline: "Garden designer & horticulturist", years: 8, base: "Airport Residential", areas: ["East Legon", "Cantonments", "Labone", "Dzorwulu", "Accra Central"], services: ["garden-design-plan", "garden-consultation", "plant-health-treatment", "planting-service", "fertilizer-programme"],
      bio: "Akosua designs gardens that suit how families actually live – shaded seating, easy-care beds and plants that cope with the dry season. She also runs our consultation and plant health visits.", quals: "BSc Horticulture, University of Ghana", portfolio: [U("1558293842-c0fd3db86157"), U("1557429287-b2e26467fc2b")], employeeId: "HG-G-102" },
    { email: "yaw.owusu@homegardens.example", name: "Yaw Owusu", type: "company", avatar: U("1531384441138-2736e62e0919", 600), headline: "Irrigation technician", years: 6, base: "Spintex", areas: ["Tema", "East Legon", "Adenta", "Airport Residential", "Accra Central", "Cantonments"], services: ["irrigation-installation", "irrigation-repair", "standard-lawn-mowing", "garden-clean-up"],
      bio: "Yaw installs and repairs sprinkler and drip systems for homes, hotels and offices. He designs systems around the water pressure and storage each property actually has.", portfolio: [P(32974060), P(8443729)], employeeId: "HG-G-103" },
    { email: "efua.boakye@example.com", name: "Efua Boakye", type: "independent", avatar: U("1531123897727-8f129e1688ce", 600), headline: "Flower beds, pots and balcony gardens", years: 5, base: "Labone", areas: ["Cantonments", "Airport Residential", "Accra Central", "Dzorwulu"], services: ["planting-service", "monthly-garden-maintenance", "weed-control", "fertilizer-programme", "garden-consultation"], rate: ghs(110),
      bio: "I help apartment owners and busy families keep colourful beds and container gardens thriving. I'm careful with plants, punctual and I always leave a tidy space.", quals: "Short course in Landscape Gardening, KNUST", portfolio: [U("1592150621744-aca64f48394a"), U("1485955900006-10f4d324d411")] },
    { email: "kojo.antwi@example.com", name: "Kojo Antwi", type: "independent", avatar: U("1522529599102-193c0d76b5b6", 600), headline: "Lawn care and hedge trimming", years: 7, base: "Adenta", areas: ["Madina", "East Legon", "Spintex", "Tema"], services: ["standard-lawn-mowing", "tree-and-hedge-pruning", "garden-clean-up", "weed-control", "monthly-garden-maintenance"], rate: ghs(100),
      bio: "I run a small lawn care business with my own mower and trimmers. Regular customers in Adenta, Madina and East Legon rely on me for neat lawns and sharp hedges.", portfolio: [P(4162011), P(24595771)] },
    { email: "adwoa.sarpong@example.com", name: "Adwoa Sarpong", type: "independent", avatar: U("1580489944761-15a19d654956", 600), headline: "Vegetable gardens and organic growing", years: 4, base: "East Legon", areas: ["Adenta", "Madina", "Airport Residential"], services: ["planting-service", "garden-consultation", "fertilizer-programme", "plant-health-treatment"], rate: ghs(120),
      bio: "I set up and maintain kitchen gardens using organic methods – raised beds, compost and natural pest control – so families can harvest their own greens, peppers and herbs.", quals: "Organic Farming certificate, ECASARD", portfolio: [U("1592150621744-aca64f48394a"), P(5529587)] },
    { email: "kwabena.osei@example.com", name: "Kwabena Osei", type: "independent", avatar: P(9709376, 600), headline: "Gardening and tree care in Kumasi", years: 9, base: "Kumasi", areas: [], services: ["standard-lawn-mowing", "monthly-garden-maintenance", "tree-and-hedge-pruning", "garden-clean-up", "weed-control"], rate: ghs(90),
      bio: "Based in Ahodwo, I look after gardens across Kumasi: mowing, pruning mango and citrus trees, and keeping compounds tidy year round.", portfolio: [U("1617576683096-00fc8eecb3af"), P(4079768)] },
    { email: "nana.addo@example.com", name: "Nana Addo", type: "independent", status: "pending", avatar: U("1506277886164-e25aa3f4ef7f", 600), headline: "Landscaping and paving", years: 3, base: "Tema", areas: ["Spintex"], services: ["landscape-installation", "garden-clean-up"], rate: ghs(130),
      bio: "I lay stepping-stone paths, edging and turf, and I'm building up my own landscaping crew in Tema.", portfolio: [P(15551712)] },
  ];
  for (const g of gardeners) {
    const u = await mkUser(g.email, g.name, "gardener", { avatarUrl: g.avatar, phone: "+233 20 000 0000" });
    const approved = (g.status ?? "approved") === "approved";
    const [gp] = await db
      .insert(schema.gardenerProfiles)
      .values({
        userId: u.id, type: g.type, slug: slugify(g.name), status: approved ? "approved" : "pending", headline: g.headline, bio: g.bio,
        yearsExperience: g.years, qualifications: g.quals ?? null, countryCode: "GH", baseCityId: cid(g.base), hourlyRate: g.rate ?? null, currency: "GHS",
        verifiedAt: approved ? new Date() : null, employeeId: g.employeeId ?? null, submittedAt: new Date(), reviewedAt: approved ? new Date() : null, reviewedBy: approved ? admin.id : null,
        payoutMethodSummary: g.type === "independent" && approved ? "MTN MoMo •••• 4417" : null,
      })
      .returning();
    await db.insert(schema.gardenerServices).values(g.services.map((s) => ({ gardenerId: gp!.id, serviceId: svc(s).id })));
    if (g.areas.length) await db.insert(schema.gardenerServiceAreas).values(g.areas.map((a) => ({ gardenerId: gp!.id, cityId: cid(a) })));
    await db.insert(schema.gardenerAvailability).values(
      [1, 2, 3, 4, 5, 6].map((weekday) => ({ gardenerId: gp!.id, weekday, startTime: "07:00", endTime: weekday === 6 ? "13:00" : "17:00" })),
    );
    await db.insert(schema.gardenerPortfolio).values(g.portfolio.map((imageUrl, i) => ({ gardenerId: gp!.id, imageUrl, sort: i })));
  }

  await db.insert(schema.testimonials).values([
    { name: "Mrs. Adjei", location: "Cantonments", quote: "Kwame's team re-turfed our front lawn before my daughter's wedding. They arrived on time every day and left the compound cleaner than they found it.", serviceLabel: "Lawn renovation", sort: 1 },
    { name: "Daniel K.", location: "East Legon", quote: "The irrigation system has cut our water bill and the lawn has stayed green through harmattan. Booking and paying with MoMo was straightforward.", serviceLabel: "Irrigation installation", sort: 2 },
    { name: "Selina A.", location: "Airport Residential", quote: "I wanted an easy garden I could enjoy in the evenings. Akosua's design was practical and the planting list told me exactly what to buy.", serviceLabel: "Garden design", sort: 3 },
  ]);
  await db.insert(schema.gardenProjects).values([
    { slug: "east-legon-front-garden", title: "Front garden rebuild", location: "East Legon, Accra", summary: "Cleared an overgrown compound, laid Paspalum turf, built raised beds and installed drip irrigation.", beforeUrl: P(26827231), afterUrl: P(15551712), serviceCategoryId: cat("landscaping"), durationLabel: "6 days", sort: 1 },
    { slug: "cantonments-hedge-renovation", title: "Hedge renovation", location: "Cantonments, Accra", summary: "Reshaped 40 metres of overgrown ficus hedge and fed it to bring back dense growth.", beforeUrl: P(11364122), afterUrl: P(24595771), serviceCategoryId: cat("tree-pruning"), durationLabel: "2 days", sort: 2 },
    { slug: "adenta-kitchen-garden", title: "Kitchen garden set-up", location: "Adenta, Accra", summary: "Turned an unused side yard into raised vegetable beds with compost and a watering schedule.", beforeUrl: U("1416879595882-3373a0480b5b"), afterUrl: U("1592150621744-aca64f48394a"), serviceCategoryId: cat("planting"), durationLabel: "3 days", sort: 3 },
  ]);

  console.log(`
Demo content seeded. Sign in with any of these (password: ${process.env.SEED_DEMO_PASSWORD || "Garden2026!"}):
  admin@homegardens.example     super administrator
  ops@homegardens.example       operations
  finance@homegardens.example   finance
  store@homegardens.example     store manager
  kwame.mensah@homegardens.example  company gardener
  kojo.antwi@example.com        independent gardener
  nana.addo@example.com         gardener application (pending)
  ama@example.com               customer
Testimonials, projects and gardener profiles are sample content – replace them before launch.`);
}

async function createAdmin(superAdminRoleId: number) {
  const email = process.env.SEED_ADMIN_EMAIL;
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!email || !password) {
    console.log("Set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD to create the first administrator.");
    return;
  }
  const [u] = await db
    .insert(schema.users)
    .values({ email, fullName: "Administrator", passwordHash: await hashPassword(password), emailVerifiedAt: new Date(), countryCode: "GH" })
    .returning();
  await db.insert(schema.userRoles).values({ userId: u!.id, roleId: superAdminRoleId });
  console.log(`Administrator ${email} created. Enable MFA after first sign-in.`);
}

main()
  .then(() => sqlClient.end())
  .catch(async (e) => {
    console.error(e);
    await sqlClient.end();
    process.exit(1);
  });
