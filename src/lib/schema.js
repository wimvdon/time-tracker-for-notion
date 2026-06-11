/**
 * Pure helpers for the raw schema object returned by getDatabaseSchema.
 * No API calls here — only data transformation.
 */

/**
 * Returns all properties of a given Notion property type.
 * @param {object} schema  Raw properties object from getDatabaseSchema
 * @param {string} type    Notion property type: 'title' | 'date' | 'status' | 'relation' | ...
 * @returns {{ name: string, id: string }[]}
 */
export function propertiesByType(schema, type) {
  return Object.entries(schema || {})
    .filter(([, prop]) => prop.type === type)
    .map(([name, prop]) => ({ name, id: prop.id }));
}

/**
 * Returns the status options for a given status property.
 * Returns [] if the property doesn't exist or isn't a status type.
 * @param {object} schema
 * @param {string} propName  Name of the status property
 * @returns {{ name: string, color: string }[]}
 */
export function statusOptions(schema, propName) {
  const prop = schema?.[propName];
  if (!prop || prop.type !== 'status') return [];
  return (prop.status?.options ?? []).map((o) => ({ name: o.name, color: o.color }));
}
