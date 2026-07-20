import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const search = searchParams.get("search") ?? "";
    const department = searchParams.get("department");
    const state = searchParams.get("state");

    const where: Record<string, unknown> = {
      dateOfExit: null,
    };

    if (search) {
      where.OR = [
        { firstName: { contains: search } },
        { lastName: { contains: search } },
        { employeeCode: { contains: search, mode: "insensitive" } },
      ];
    }

    if (department) {
      where.department = department;
    }

    if (state) {
      where.state = state;
    }

    const employees = await db.employee.findMany({
      where,
      include: { salaryStructure: true },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(employees);
  } catch (error) {
    console.error("Error fetching employees:", error);
    return NextResponse.json(
      { error: "Failed to fetch employees" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      employeeCode,
      salaryStructure: salaryStructureData,
      ...employeeData
    } = body;

    // Generate employeeCode if not provided
    let code = employeeCode;
    if (!code) {
      const lastEmployee = await db.employee.findFirst({
        orderBy: { createdAt: "desc" },
        select: { employeeCode: true },
      });
      const lastNumber = lastEmployee
        ? parseInt(lastEmployee.employeeCode.replace("EMP", ""), 10) || 0
        : 0;
      code = `EMP${String(lastNumber + 1).padStart(4, "0")}`;
    }

    const employee = await db.employee.create({
      data: {
        ...employeeData,
        employeeCode: code,
        salaryStructure: salaryStructureData
          ? { create: salaryStructureData }
          : undefined,
      },
      include: { salaryStructure: true },
    });

    return NextResponse.json(employee, { status: 201 });
  } catch (error) {
    console.error("Error creating employee:", error);
    return NextResponse.json(
      { error: "Failed to create employee" },
      { status: 500 }
    );
  }
}
