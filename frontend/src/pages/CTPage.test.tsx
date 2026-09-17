import { render, screen, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'
import CTPage from './CTPage'

vi.mock('../api/client', () => ({
  getCTVersions: vi.fn().mockResolvedValue({ data: [{ version: 'SEND Terminology 2020-06-26', published_date: '2020-06-26', is_default: true }] }),
  getCTCodelists: vi.fn().mockResolvedValue({ data: [
    { codelist: 'SEX', term_count: 1 },
    { codelist: 'LBTESTCD', term_count: 1 },
    { codelist: 'SPEC', term_count: 1 },
    { codelist: 'FXFINDRS', term_count: 1 },
    { codelist: 'NEOPLASM', term_count: 1 },
  ] }),
  getCTCodelistTerms: vi.fn().mockResolvedValue({ data: { terms: [{ code: 'M', label: 'MALE', name_in_data: 'M', description: 'Male subject' }] } }),
  importCTCsv: vi.fn().mockResolvedValue({ data: { message: 'ok' } }),
  exportCTCsv: vi.fn(),
  removeCTVersion: vi.fn(),
}))

describe('CTPage', () => {
  it('renders a package file input on the CT screen for the downloaded package install flow', () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <CTPage />
      </QueryClientProvider>,
    )

    const packageFileInput = container.querySelector('input[type="file"][accept=".txt"]')
    expect(packageFileInput).not.toBeNull()
  })

  it('allows the user to select a CT version and continue to the definition screen', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

    render(
      <QueryClientProvider client={queryClient}>
        <CTPage />
      </QueryClientProvider>,
    )

    const versionSelect = await screen.findByLabelText('Controlled Terminology Version')
    expect(versionSelect).toBeInTheDocument()

    fireEvent.change(versionSelect, { target: { value: 'SEND Terminology 2020-06-26' } })

    const typeSelect = screen.getByLabelText('Controlled Terminology Type')
    fireEvent.change(typeSelect, { target: { value: 'SEX' } })

    fireEvent.click(screen.getByRole('button', { name: 'Next' }))

    expect(screen.getByText(/Controlled Terminology Submission for Type - SEX, Extensible - YES/i)).toBeInTheDocument()
    expect(screen.getByText('SEND Terminology 2020-06-26')).toBeInTheDocument()
  })

  it('shows only terms for the selected controlled terminology type', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

    render(
      <QueryClientProvider client={queryClient}>
        <CTPage />
      </QueryClientProvider>,
    )

    fireEvent.change(await screen.findByLabelText('Controlled Terminology Version'), { target: { value: 'SEND Terminology 2020-06-26' } })
    fireEvent.change(screen.getByLabelText('Controlled Terminology Type'), { target: { value: 'SEX' } })
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))

    expect(await screen.findByText('MALE')).toBeInTheDocument()
    expect(screen.queryByText('Body Weight')).not.toBeInTheDocument()
  })

  it('shows New Code input when an extensible CT type selects a new code in the add form', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

    render(
      <QueryClientProvider client={queryClient}>
        <CTPage />
      </QueryClientProvider>,
    )

    fireEvent.change(await screen.findByLabelText('Controlled Terminology Version'), { target: { value: 'SEND Terminology 2020-06-26' } })
    fireEvent.change(screen.getByLabelText('Controlled Terminology Type'), { target: { value: 'LBTESTCD' } })
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))

    const codeSelect = screen.getByLabelText('Code')
    fireEvent.change(codeSelect, { target: { value: 'new' } })

    expect(screen.getByLabelText('New Code')).toBeInTheDocument()
  })

  it('shows SPEC-specific columns for specimen terminology types', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

    render(
      <QueryClientProvider client={queryClient}>
        <CTPage />
      </QueryClientProvider>,
    )

    fireEvent.change(await screen.findByLabelText('Controlled Terminology Version'), { target: { value: 'SEND Terminology 2020-06-26' } })
    fireEvent.change(screen.getByLabelText('Controlled Terminology Type'), { target: { value: 'SPEC' } })
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))

    expect(screen.getAllByText('Anatomical Region').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Directionality').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Portion or Totality').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Method').length).toBeGreaterThan(0)
  })

  it('shows SPEC creation modal drop-down fields for laterality and directionality', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

    render(
      <QueryClientProvider client={queryClient}>
        <CTPage />
      </QueryClientProvider>,
    )

    fireEvent.change(await screen.findByLabelText('Controlled Terminology Version'), { target: { value: 'SEND Terminology 2020-06-26' } })
    fireEvent.change(screen.getByLabelText('Controlled Terminology Type'), { target: { value: 'SPEC' } })
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))

    expect(screen.getByLabelText('Laterality')).toBeInTheDocument()
    expect(screen.getByLabelText('Directionality')).toBeInTheDocument()
    expect(screen.getByLabelText('Portion or Totality')).toBeInTheDocument()
  })

  it('shows FXFINDRS-specific columns for finding terminology types', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

    render(
      <QueryClientProvider client={queryClient}>
        <CTPage />
      </QueryClientProvider>,
    )

    fireEvent.change(await screen.findByLabelText('Controlled Terminology Version'), { target: { value: 'SEND Terminology 2020-06-26' } })
    fireEvent.change(screen.getByLabelText('Controlled Terminology Type'), { target: { value: 'FXFINDRS' } })
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))

    expect(screen.getAllByText('Distribution').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Result Modifiers').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Result Location').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Result Category').length).toBeGreaterThan(0)
  })

  it('shows FXFINDRS creation modal editable fields for distribution, result modifiers, and result location', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

    render(
      <QueryClientProvider client={queryClient}>
        <CTPage />
      </QueryClientProvider>,
    )

    fireEvent.change(await screen.findByLabelText('Controlled Terminology Version'), { target: { value: 'SEND Terminology 2020-06-26' } })
    fireEvent.change(screen.getByLabelText('Controlled Terminology Type'), { target: { value: 'FXFINDRS' } })
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))

    const distributionSelect = screen.getByLabelText('Distribution') as HTMLSelectElement
    const resultModifiersInput = screen.getByLabelText('Result Modifiers') as HTMLInputElement
    const resultLocationInput = screen.getByLabelText('Result Location') as HTMLInputElement
    const resultCategoryInput = screen.getByLabelText('Result Category') as HTMLInputElement

    expect(distributionSelect.disabled).toBe(false)
    expect(resultModifiersInput.readOnly).toBe(false)
    expect(resultLocationInput.readOnly).toBe(false)
    expect(resultCategoryInput.readOnly).toBe(false)
  })

  it('shows NEOPLASM-specific columns with chronicity for neoplasm terminology types', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

    render(
      <QueryClientProvider client={queryClient}>
        <CTPage />
      </QueryClientProvider>,
    )

    fireEvent.change(await screen.findByLabelText('Controlled Terminology Version'), { target: { value: 'SEND Terminology 2020-06-26' } })
    fireEvent.change(screen.getByLabelText('Controlled Terminology Type'), { target: { value: 'NEOPLASM' } })
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))

    expect(screen.getAllByText('Distribution').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Chronicity').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Result Modifiers').length).toBeGreaterThan(0)
  })

  it('shows NEOPLASM creation modal with editable distribution and chronicity dropdowns', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

    render(
      <QueryClientProvider client={queryClient}>
        <CTPage />
      </QueryClientProvider>,
    )

    fireEvent.change(await screen.findByLabelText('Controlled Terminology Version'), { target: { value: 'SEND Terminology 2020-06-26' } })
    fireEvent.change(screen.getByLabelText('Controlled Terminology Type'), { target: { value: 'NEOPLASM' } })
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))

    const distributionSelect = screen.getByLabelText('Distribution') as HTMLSelectElement
    const chronicitySelect = screen.getByLabelText('Chronicity') as HTMLSelectElement
    const resultModifiersInput = screen.getByLabelText('Result Modifiers') as HTMLInputElement

    expect(distributionSelect.disabled).toBe(false)
    expect(chronicitySelect.disabled).toBe(false)
    expect(resultModifiersInput.readOnly).toBe(false)

    // Verify dropdown options
    const distributionOptions = Array.from(distributionSelect.options).map(option => option.value)
    expect(distributionOptions).toContain('LOCALIZED')
    expect(distributionOptions).toContain('DIFFUSE')
    expect(distributionOptions).toContain('FOCAL')

    const chronicityOptions = Array.from(chronicitySelect.options).map(option => option.value)
    expect(chronicityOptions).toContain('ACUTE')
    expect(chronicityOptions).toContain('CHRONIC')
    expect(chronicityOptions).toContain('SUBACUTE')
  })
})
