import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { Fold, FoldRow, ShowMore } from './fold'
import { ListCard } from './list-card'
import { SECTION_GAP, SECTION_HEAD_GAP, SectionHeader } from './section-header'

const meta = {
  title: 'Structure/Sections and folds',
  component: SectionHeader,
} satisfies Meta<typeof SectionHeader>

export default meta
type Story = StoryObj<typeof meta>

/** The page grade, the pane grade, a danger zone and a fold, stacked. */
export const Grades: Story = {
  args: { layout: 'page', title: 'Evaluations' },
  render: () => (
    <div className={`flex max-w-xl flex-col ${SECTION_GAP}`}>
      <section>
        <SectionHeader
          layout="page"
          title="Evaluations"
          description="The last 60 minutes, one column a minute."
          aside="60 min"
          className={SECTION_HEAD_GAP}
        />
        <p className="text-sm text-muted-foreground">Body of a page section.</p>
      </section>
      <section>
        <SectionHeader layout="pane" title="Facts" aside="6" className={SECTION_HEAD_GAP} />
        <p className="text-sm text-muted-foreground">Body of a pane section.</p>
      </section>
      <Fold title="Raw record" aside="json">
        <p className="text-sm text-muted-foreground">Folded body, mounted while closed.</p>
      </Fold>
      <section>
        <SectionHeader layout="pane" danger title="Danger zone" className={SECTION_HEAD_GAP} />
        <p className="text-sm text-muted-foreground">What deleting does.</p>
      </section>
    </div>
  ),
}

/** Rows that open in place, and a list that lengthens. */
export const Rows: Story = {
  args: Grades.args,
  render: function Render() {
    const [more, setMore] = useState(false)
    const rows = ['checkout-v2', 'dark-mode-default', 'rate-limit-v2', 'beta-dashboard']
    const shown = more ? rows : rows.slice(0, 2)
    return (
      <div className="flex max-w-xl flex-col gap-3">
        <ListCard columns="minmax(0,1fr)">
          <ul id="story-rows">
            {shown.map((row, index) => (
              <ListCard.Item key={row}>
                <FoldRow selected={index === 0} summary={<span className="mono">{row}</span>}>
                  <p className="py-2 text-xs text-muted-foreground">Details of {row}.</p>
                </FoldRow>
              </ListCard.Item>
            ))}
          </ul>
        </ListCard>
        <ShowMore
          count={rows.length - 2}
          open={more}
          onOpenChange={setMore}
          controls="story-rows"
        />
      </div>
    )
  },
}
