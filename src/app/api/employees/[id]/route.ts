import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const employee = await db.employee.findUnique({
      where: { id },
      include: { salaryStructure: true },
    });

    if (!employee) {
      return NextResponse.json({ error: "Employee not found" }, { status: 404 });
    }

    return NextResponse.json(employee);
  } catch (error) {
    console.error("Error fetching employee:", error);
    return NextResponse.json(
      { error: "Failed to fetch employee" },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { salaryStructure: salaryStructureData, ...employeeData } = body;

    const existing = await db.employee.findUnique({
      where: { id },
      include: { salaryStructure: true },
    });

    if (!existing) {
      return NextResponse.json({ error: "Employee not found" }, { status: 404 });
    }

    // Build salary structure update payload
    let salaryPayload: Record<string, unknown> | undefined;
    if (salaryStructureData) {
      if (existing.salaryStructure) {
        salaryPayload = { update: salaryStructureData };
      } else {
        salaryPayload = { create: salaryStructureData };
      }
    }

    const employee = await db.employee.update({
      where: { id },
      data: {
        ...employeeData,
        ...(salaryPayload ? { salaryStructure: salaryPayload } : {}),
      },
      include: { salaryStructure: true },
    });

    return NextResponse.json(employee);
  } catch (error) {
    console.error("Error updating employee:", error);
    return NextResponse.json(
      { error: "Failed to update employee" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const existing = await db.employee.findUnique({ where: { id } });

    if (!existing) {
      return NextResponse.json({ error: "Employee not found" }, { status: 404 });
    }

    const employee = await db.employee.update({
      where: { id },
      data: { dateOfExit: new Date() },
      include: { salaryStructure: true },
    });

    return NextResponse.json(employee);
  } catch (error) {
    console.error("Error deleting employee:", error);
    return NextResponse.json(
      { error: "Failed to delete employee" },
      { status: 500 }
    );
  }
}