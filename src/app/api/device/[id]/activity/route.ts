import { NextResponse } from "next/server";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const store = global.deviceDataStore;

    if (!store || !store.has(id)) {
      return NextResponse.json(
        { error: "Device not found", id },
        { status: 404 }
      );
    }

    const device = store.get(id);
    return NextResponse.json({
      activity: device?.detectedActivity?.activity || "unknown",
      confidence: device?.detectedActivity?.confidence || 0,
    });
  } catch (error) {
    console.error("Error in GET /api/device/[id]/activity:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
