import { DeterministicRandom } from "./prng.ts";
import type { CustomerProfile, CustomerSegment, GeneratorConfig } from "./types.ts";

function createProfile(
  numericId: number,
  customerSegment: CustomerSegment,
  repeatWeight: number,
  repeatProbability: number,
  missingSegmentRate: number,
  random: DeterministicRandom,
): CustomerProfile {
  return {
    customerId: `CUST-${numericId.toString().padStart(4, "0")}`,
    customerSegment,
    reportedCustomerSegment: random.next() < missingSegmentRate ? "" : customerSegment,
    repeatWeight,
    repeatEligible: random.next() < repeatProbability,
  };
}

export function createCustomerPopulation(
  config: GeneratorConfig,
  random: DeterministicRandom,
): readonly CustomerProfile[] {
  const customers: CustomerProfile[] = [];
  let numericId = 1;
  const segmentDefinitions = [
    { segment: "Loyal" as const, config: config.customerSegments.loyal },
    { segment: "Occasional" as const, config: config.customerSegments.occasional },
    { segment: "New" as const, config: config.customerSegments.new },
  ];

  for (const definition of segmentDefinitions) {
    for (let index = 0; index < definition.config.count; index += 1) {
      customers.push(
        createProfile(
          numericId,
          definition.segment,
          definition.config.repeatWeight,
          definition.config.repeatProbability,
          config.optionalMissingness.customerSegmentRate,
          random,
        ),
      );
      numericId += 1;
    }
  }

  return customers;
}

export function assignCustomersToOrders(
  orderCount: number,
  customers: readonly CustomerProfile[],
  random: DeterministicRandom,
): readonly CustomerProfile[] {
  const repeatEligibleCustomers = customers.filter((customer) => customer.repeatEligible);
  const minimumAssignments = customers.length + repeatEligibleCustomers.length;

  if (orderCount < minimumAssignments) {
    throw new Error(
      `At least ${minimumAssignments} orders are required to preserve propensity outcomes.`,
    );
  }
  if (repeatEligibleCustomers.length === 0) {
    throw new Error("The configured customer propensities produced no repeat-eligible customers.");
  }

  const assignments: Array<CustomerProfile | undefined> = Array(orderCount);
  const positions = random.shuffle(Array.from({ length: orderCount }, (_, index) => index));
  let cursor = 0;

  for (const customer of random.shuffle(customers)) {
    assignments[positions[cursor]] = customer;
    cursor += 1;
  }

  for (const customer of random.shuffle(repeatEligibleCustomers)) {
    assignments[positions[cursor]] = customer;
    cursor += 1;
  }

  while (cursor < positions.length) {
    assignments[positions[cursor]] = random.weighted(
      repeatEligibleCustomers,
      (customer) => customer.repeatWeight,
    );
    cursor += 1;
  }

  return assignments as readonly CustomerProfile[];
}
