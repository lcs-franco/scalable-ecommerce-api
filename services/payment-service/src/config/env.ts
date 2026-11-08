import 'dotenv/config'
import { parseEnv } from './parse-env.js'

export const config = parseEnv(process.env)
