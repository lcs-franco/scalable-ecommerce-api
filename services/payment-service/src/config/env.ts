import { loadConfig } from '@ecommerce/service'
import { envSchema } from './parse-env.js'

export const config = loadConfig(envSchema)
