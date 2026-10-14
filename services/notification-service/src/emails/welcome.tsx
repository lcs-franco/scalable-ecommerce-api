import { Heading, Text } from 'react-email'
import { EmailLayout } from './layout.js'

interface IWelcomeEmailProps {
  name: string
}

export function WelcomeEmail({ name }: IWelcomeEmailProps) {
  return (
    <EmailLayout preview="Your account was created">
      <Heading className="text-2xl text-gray-900">Welcome, {name}!</Heading>
      <Text className="text-gray-700">
        Your account was created. Happy shopping!
      </Text>
    </EmailLayout>
  )
}
