export interface ApiResponse<T> {
  data: T;
  message?: string;
  success: boolean;
}

export async function request<T>(input: RequestInfo | URL, init?: RequestInit): Promise<ApiResponse<T>> {
  const response = await fetch(input, init);

  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`);
  }

  return response.json() as Promise<ApiResponse<T>>;
}
