export const ADMIN_OVERVIEW_RECORDS_SQL = `
  SELECT
    g.id,
    g.user_id,
    g.username,
    g.prompt,
    g.model_id,
    g.model_name,
    g.dimensions,
    g.image_size,
    g.image_path,
    g.credits_used,
    g.api_request_ms,
    g.reference_images,
    g.result_status,
    g.result_message,
    g.created_at
  FROM generation_requests g
  WHERE g.username != 'demo'
  ORDER BY datetime(g.created_at) DESC, g.id DESC
  LIMIT ? OFFSET ?
`;
