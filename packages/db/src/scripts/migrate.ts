import { runSchemaWrite } from './schema-write'

runSchemaWrite('migrate', process.argv.includes('--check'))
