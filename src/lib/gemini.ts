export interface ReferenceImageInput {
  mimeType: string;
  data: string;
}

export interface GenerateImageOptions {
  model: string;
  imageSize: string;
}

interface GenerateImageResponse {
  image: string;
}

export async function generateImage(
  prompt: string,
  aspectRatio: string,
  references: ReferenceImageInput[] = [],
  options?: Partial<GenerateImageOptions>,
) {
  const response = await fetch('/api/generate-image', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      prompt,
      aspectRatio,
      references,
      model: options?.model,
      imageSize: options?.imageSize,
    }),
  });

  let payload: GenerateImageResponse | { error?: string } | null = null;

  try {
    payload = (await response.json()) as GenerateImageResponse | { error?: string };
  } catch {
    payload = null;
  }

  if (!response.ok || !payload || !('image' in payload)) {
    throw new Error(
      payload && 'error' in payload && payload.error
        ? payload.error
        : 'Image generation request failed. Please check whether the local backend is running.',
    );
  }

  return payload.image;
}
