'use client'

import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Calendar, AlertTriangle, Minimize2, X } from "lucide-react"
import { useI18n } from "@/lib/contexts/i18n"

interface OpenDaysModalProps {
  isOpen: boolean
  onClose: () => void
  onEditDay: (date: string) => void
  onCloseDay: (date: string) => void
  openDays: Array<{
    date: string
    earnings?: number
    status: string
  }>
  timeframe: "day" | "week"
  isMinimized?: boolean
  onMinimize?: () => void
  onRestore?: () => void
  editingDay?: string | null
}

export function OpenDaysModal({
  isOpen,
  onClose,
  onEditDay,
  onCloseDay,
  openDays,
  timeframe,
  isMinimized = false,
  onMinimize,
  onRestore,
  editingDay = null
}: OpenDaysModalProps) {
  const { t } = useI18n()
  const [isClosing, setIsClosing] = useState(false)

  const handleCloseDay = async (date: string) => {
    setIsClosing(true)
    try {
      await onCloseDay(date)
    } finally {
      setIsClosing(false)
    }
  }

  const handleEditDay = (date: string) => {
    onEditDay(date)
    // The minimize will be handled by the parent component
  }

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="sm:max-w-[425px] z-[9999]">
          {!isMinimized && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-amber-500" />
                    {timeframe === "day" ? t('modal.openDaysTitle') : t('modal.openWeeksTitle')}
                  </div>
                  {onMinimize && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={onMinimize}
                      className="h-8 w-8 p-0"
                    >
                      <Minimize2 className="h-4 w-4" />
                    </Button>
                  )}
                </DialogTitle>
                <DialogDescription>
                  {timeframe === "day" ? t('modal.openDaysDescription') : t('modal.openWeeksDescription')}
                </DialogDescription>
              </DialogHeader>
              
              <div className="space-y-3">
                {openDays.length === 0 ? (
                  <div className="text-center py-4 text-muted-foreground">
                    {timeframe === "day" ? t('modal.noOpenDays') : t('modal.noOpenWeeks')}
                  </div>
                ) : (
                  openDays.map((day, index) => (
                    <div key={`${day.date}-${index}`} className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex items-center gap-3">
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <div className="font-medium">{day.date}</div>
                          {day.earnings !== undefined && (
                            <div className="text-sm text-muted-foreground">
                              Ð{day.earnings.toFixed(2)}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleEditDay(day.date)}
                          disabled={isClosing}
                        >
                          {t('common.edit')}
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => handleCloseDay(day.date)}
                          disabled={isClosing}
                        >
                          {t('common.close')}
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={onClose}>
                  {t('common.cancel')}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Minimized Bottom Navigation */}
      {isMinimized && (
        <div className="fixed bottom-0 left-0 right-0 z-[9999] bg-background border-t shadow-lg">
          <div className="flex items-center justify-between p-4">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              <div>
                <div className="font-medium text-sm">
                  {editingDay ? t('modal.editingDay', { date: editingDay }) : t('modal.openDaysTitle')}
                </div>
                <div className="text-xs text-muted-foreground">
                  {timeframe === "day" ? t('modal.openDaysDescription') : t('modal.openWeeksDescription')}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {editingDay && (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => onCloseDay(editingDay)}
                  className="h-8"
                >
                  {t('common.close')} {editingDay}
                </Button>
              )}
              {onRestore && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onRestore}
                  className="h-8"
                >
                  <Minimize2 className="h-4 w-4 mr-1" />
                  {t('modal.restore')}
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={onClose}
                className="h-8 w-8 p-0"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
