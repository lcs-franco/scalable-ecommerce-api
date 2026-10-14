import type { ReactNode } from 'react'
import {
  Body,
  Container,
  Head,
  Hr,
  Html,
  pixelBasedPreset,
  Preview,
  Tailwind,
  Text,
} from 'react-email'

interface IEmailLayoutProps {
  preview: string
  children: ReactNode
}

export function EmailLayout({ preview, children }: IEmailLayoutProps) {
  return (
    <Html lang="en">
      <Tailwind config={{ presets: [pixelBasedPreset] }}>
        <Head />
        <Preview>{preview}</Preview>
        <Body className="bg-gray-100 font-sans">
          <Container className="mx-auto my-8 max-w-[560px] rounded-lg bg-white p-8">
            <Text className="m-0 text-xl font-bold text-gray-900">
              E-commerce
            </Text>
            <Hr className="my-6 border-gray-200" />
            {children}
          </Container>
        </Body>
      </Tailwind>
    </Html>
  )
}
