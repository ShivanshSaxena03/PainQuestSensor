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
    return NextResponse.json(
      device?.pose || {
        headRotation: 0,
        bodyTilt: 0,
        leftArm: 0,
        rightArm: 0,
        leftLeg: 0,
        rightLeg: 0,
      }
    );
  } catch (error) {
    console.error("Error in GET /api/device/[id]/pose:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
