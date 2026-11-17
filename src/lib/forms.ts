export type FormResult = { error?: string; message?: string };
export type LiveFormAction = (previous: FormResult, form: FormData) => Promise<FormResult>;

export function field(form: FormData, name: string) {
  const value = form.get(name);
  return typeof value === "string" ? value.trim() : "";
}
