export type ClockStatus = {
  name: string;
  status: "IN" | "OUT";
  time: string | null;
};

export type Employee = {
  id: string;
  name: string;
  active: boolean;
  isAdmin: boolean;
};

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    let message = res.statusText;
    try {
      const body = await res.json();
      if (typeof body?.error === "string") message = body.error;
    } catch {
      // non-JSON error body; keep statusText
    }
    throw new ApiError(res.status, message);
  }
  return res.json() as Promise<T>;
}

function jsonInit(method: string, body: unknown, token?: string): RequestInit {
  return {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  };
}

export function getStatus(employeeId: string): Promise<ClockStatus> {
  return request(`/api/status?employee=${encodeURIComponent(employeeId)}`);
}

export function postClock(employeeId: string, action: "IN" | "OUT"): Promise<ClockStatus> {
  return request("/api/clock", jsonInit("POST", { employeeId, action }));
}

export function adminLogin(employeeId: string): Promise<{ token: string }> {
  return request("/api/admin/login", jsonInit("POST", { employeeId }));
}

export function adminLogout(token: string): Promise<{ ok: true }> {
  return request("/api/admin/logout", jsonInit("POST", {}, token));
}

export function listEmployees(token: string): Promise<Employee[]> {
  return request("/api/admin/employees", {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export function createEmployee(token: string, name: string, id?: string): Promise<Employee> {
  return request("/api/admin/employees", jsonInit("POST", { name, id: id || undefined }, token));
}

export function setEmployeeActive(token: string, id: string, active: boolean): Promise<Employee> {
  return request(`/api/admin/employees/${id}`, jsonInit("PATCH", { active }, token));
}

export function deleteEmployee(token: string, id: string): Promise<{ ok: true }> {
  return request(`/api/admin/employees/${id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
}
