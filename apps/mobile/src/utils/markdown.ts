import MarkdownIt from 'markdown-it'

const markdown = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true,
})

export const renderMarkdown = (content: string) => markdown.render(content || '')
