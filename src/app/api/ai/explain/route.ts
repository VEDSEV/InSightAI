import { NextResponse } from "next/server";
import { explainEvidencePacket } from "@/ai/service";
import { hasLiveProviderConfiguration } from "@/ai/provider";
import { validateEvidencePacket } from "@/ai/validation";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { status: "invalid", message: "A JSON evidence packet is required." },
      { status: 400 },
    );
  }
  if (!body || typeof body !== "object" || !("packet" in body))
    return NextResponse.json(
      { status: "invalid", message: "The evidence packet is incomplete." },
      { status: 400 },
    );
  const { packet, uploadedDataset, consent } = body as {
    packet: unknown;
    uploadedDataset?: unknown;
    consent?: unknown;
  };
  if (!validateEvidencePacket(packet))
    return NextResponse.json(
      { status: "invalid", message: "The evidence packet is incomplete." },
      { status: 400 },
    );
  if (uploadedDataset === true && hasLiveProviderConfiguration() && consent !== true)
    return NextResponse.json(
      {
        status: "consent_required",
        message:
          "Review the minimized evidence summary and give session-only consent before sending uploaded-data evidence.",
      },
      { status: 403 },
    );
  const result = await explainEvidencePacket(packet);
  return NextResponse.json(result, { status: result.status === "ok" ? 200 : 422 });
}
