export type Page = {
  id: string
  title: string
  sprint: string
  status: string
  content: string
}

export type LinkedPage = {
  id: string
  title: string
  content: string
  status: string
  sprint: string
  issue_number: number
}
