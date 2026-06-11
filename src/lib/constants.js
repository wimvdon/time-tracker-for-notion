/**
 * Default Notion property names — matches the standard database setup.
 * Each project carries its own propertyMap (editable in Settings) so the app
 * keeps working when properties are renamed in Notion.
 */
export const DEFAULT_PROPERTY_MAP = {
  tijdsTitleProp: 'Tijdsregistratie', // title field in Tijdsregistraties
  tijdsTijdProp: 'Tijd', // date range field
  tijdsStatusProp: 'Status', // status field
  tijdsStatusRunning: 'Lopende tijdsregistratie',
  tijdsStatusDone: 'Voltooide tijdsregistratie',
  tijdsRelationProp: 'Gekoppeld deelproject', // relation to Deelprojecten
  deelTitleProp: 'Deelproject', // title field in Deelprojecten
};
