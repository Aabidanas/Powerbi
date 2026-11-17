export type AttachedDataset = {
  challenge_id: string;
  object_path: string;
  original_name: string | null;
  size_bytes: string | null;
};

export function datasetFileName(file: AttachedDataset) {
  const original = file.original_name?.trim();
  if (original && original.length <= 255 && !/[\\/\r\n]/.test(original)) return original;
  const stored = file.object_path.split("/").at(-1) ?? "dataset";
  return stored.replace(/^(?:[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}|[a-f\d]{8})-/i, "");
}

export function datasetFileSize(file: AttachedDataset) {
  const size = file.size_bytes === null ? NaN : Number(file.size_bytes);
  if (!Number.isFinite(size) || size < 0) return null;
  if (size < 1024) return `${size} B`;
  if (size < 1024 ** 2) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 ** 2).toFixed(1)} MB`;
}
