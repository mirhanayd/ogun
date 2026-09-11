import { runSchemaWrite } from './schema-write'

runSchemaWrite('push', process.argv.includes('--check'))
