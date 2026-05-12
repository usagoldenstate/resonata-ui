"use client"

import { useState } from "react"
import { Building2, Phone, Users, Mail, Globe, Save, FileText, X, Plus, ChevronDown, ChevronUp } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Sidebar } from "@/components/sidebar"

export default function SettingsPage() {
  const [hotelName, setHotelName] = useState("The Grand Monarch Hotel")
  const [phoneNumber, setPhoneNumber] = useState("+1 (555) 123-4567")
  const [email, setEmail] = useState("reservations@grandmonarch.com")
  const [website, setWebsite] = useState("www.grandmonarch.com")
  const [timezone, setTimezone] = useState("America/New_York")
  const [currency, setCurrency] = useState("USD")
  const [language, setLanguage] = useState("en")
  
  // Call settings
  const [businessHoursStart, setBusinessHoursStart] = useState("08:00")
  const [businessHoursEnd, setBusinessHoursEnd] = useState("22:00")
  const [afterHoursMessage, setAfterHoursMessage] = useState(true)
  const [callRecording, setCallRecording] = useState(true)
  const [maxCallDuration, setMaxCallDuration] = useState("30")

  // Report subscription settings
  const availableReports = [
    { id: "call-volume", name: "Call Volume Report", description: "Daily call volume and trends" },
    { id: "conversion", name: "Conversion Analytics", description: "Booking conversion rates" },
    { id: "not-booked", name: "Not Booked Analysis", description: "Why guests didn't book" },
    { id: "revenue", name: "Revenue Summary", description: "Room and upsell revenue" },
  ]

  // Each subscriber has individual daily/weekly preferences per report
  const [reportSubscriptions, setReportSubscriptions] = useState<Record<string, { 
    email: string; 
    daily: boolean; 
    weekly: boolean; 
  }[]>>({
    "call-volume": [
      { email: "manager@hotel.com", daily: true, weekly: true },
      { email: "frontdesk@hotel.com", daily: false, weekly: true },
    ],
    "conversion": [
      { email: "manager@hotel.com", daily: false, weekly: true },
    ],
    "not-booked": [
      { email: "manager@hotel.com", daily: false, weekly: true },
      { email: "sales@hotel.com", daily: true, weekly: false },
    ],
    "revenue": [
      { email: "manager@hotel.com", daily: true, weekly: true },
      { email: "accounting@hotel.com", daily: true, weekly: true },
    ],
  })

  const [newSubscriberEmail, setNewSubscriberEmail] = useState("")
  const [expandedReport, setExpandedReport] = useState<string | null>(null)
  const [dailyDeliveryTime, setDailyDeliveryTime] = useState("08:00")
  const [weeklyDeliveryDay, setWeeklyDeliveryDay] = useState("monday")
  const [digestFormat, setDigestFormat] = useState("summary")

  const toggleSubscriberSchedule = (reportId: string, email: string, scheduleType: "daily" | "weekly") => {
    setReportSubscriptions(prev => ({
      ...prev,
      [reportId]: prev[reportId].map(sub => 
        sub.email === email 
          ? { ...sub, [scheduleType]: !sub[scheduleType] }
          : sub
      )
    }))
  }

  const addSubscriber = (reportId: string) => {
    if (newSubscriberEmail && !reportSubscriptions[reportId].some(s => s.email === newSubscriberEmail)) {
      setReportSubscriptions(prev => ({
        ...prev,
        [reportId]: [...prev[reportId], { email: newSubscriberEmail, daily: false, weekly: true }]
      }))
      setNewSubscriberEmail("")
    }
  }

  const removeSubscriber = (reportId: string, email: string) => {
    setReportSubscriptions(prev => ({
      ...prev,
      [reportId]: prev[reportId].filter(s => s.email !== email)
    }))
  }

  const getSubscriberCounts = (reportId: string) => {
    const subs = reportSubscriptions[reportId] || []
    return {
      daily: subs.filter(s => s.daily).length,
      weekly: subs.filter(s => s.weekly).length,
      total: subs.length
    }
  }

  const [saved, setSaved] = useState(false)

  const handleSave = () => {
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />

      <main className="flex-1 p-8">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-semibold text-foreground">Settings</h2>
            <p className="text-sm text-muted-foreground mt-1">Manage your hotel and system preferences</p>
          </div>
          <Button 
            onClick={handleSave}
            className="bg-[#6b7a4a] hover:bg-[#5a6940] text-white"
          >
            <Save className="w-4 h-4 mr-2" />
            {saved ? "Saved!" : "Save Changes"}
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-6">
          {/* Hotel Information */}
          <Card className="border-border">
            <CardHeader className="pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-[#6b7a4a]/10 flex items-center justify-center">
                  <Building2 className="w-5 h-5 text-[#6b7a4a]" />
                </div>
                <div>
                  <CardTitle className="text-base">Hotel Information</CardTitle>
                  <CardDescription className="text-xs">Basic details about your property</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="hotelName" className="text-xs text-muted-foreground">Hotel Name</Label>
                <Input
                  id="hotelName"
                  value={hotelName}
                  onChange={(e) => setHotelName(e.target.value)}
                  className="bg-card border-border"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone" className="text-xs text-muted-foreground">Phone Number</Label>
                <Input
                  id="phone"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  className="bg-card border-border"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email" className="text-xs text-muted-foreground">Email Address</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="bg-card border-border"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="website" className="text-xs text-muted-foreground">Website</Label>
                <Input
                  id="website"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  className="bg-card border-border"
                />
              </div>
            </CardContent>
          </Card>

          {/* Regional Settings */}
          <Card className="border-border">
            <CardHeader className="pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-[#6b7a4a]/10 flex items-center justify-center">
                  <Globe className="w-5 h-5 text-[#6b7a4a]" />
                </div>
                <div>
                  <CardTitle className="text-base">Regional Settings</CardTitle>
                  <CardDescription className="text-xs">Timezone, currency, and language</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="timezone" className="text-xs text-muted-foreground">Timezone</Label>
                <Select value={timezone} onValueChange={setTimezone}>
                  <SelectTrigger className="bg-card border-border">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="America/New_York">Eastern Time (ET)</SelectItem>
                    <SelectItem value="America/Chicago">Central Time (CT)</SelectItem>
                    <SelectItem value="America/Denver">Mountain Time (MT)</SelectItem>
                    <SelectItem value="America/Los_Angeles">Pacific Time (PT)</SelectItem>
                    <SelectItem value="Europe/London">London (GMT)</SelectItem>
                    <SelectItem value="Europe/Paris">Paris (CET)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="currency" className="text-xs text-muted-foreground">Currency</Label>
                <Select value={currency} onValueChange={setCurrency}>
                  <SelectTrigger className="bg-card border-border">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="USD">USD ($)</SelectItem>
                    <SelectItem value="EUR">EUR (€)</SelectItem>
                    <SelectItem value="GBP">GBP (£)</SelectItem>
                    <SelectItem value="CAD">CAD ($)</SelectItem>
                    <SelectItem value="AUD">AUD ($)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="language" className="text-xs text-muted-foreground">Language</Label>
                <Select value={language} onValueChange={setLanguage}>
                  <SelectTrigger className="bg-card border-border">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="en">English</SelectItem>
                    <SelectItem value="es">Spanish</SelectItem>
                    <SelectItem value="fr">French</SelectItem>
                    <SelectItem value="de">German</SelectItem>
                    <SelectItem value="it">Italian</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Call Settings */}
          <Card className="border-border">
            <CardHeader className="pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-[#6b7a4a]/10 flex items-center justify-center">
                  <Phone className="w-5 h-5 text-[#6b7a4a]" />
                </div>
                <div>
                  <CardTitle className="text-base">Call Settings</CardTitle>
                  <CardDescription className="text-xs">Configure call handling preferences</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="businessStart" className="text-xs text-muted-foreground">Business Hours Start</Label>
                  <Input
                    id="businessStart"
                    type="time"
                    value={businessHoursStart}
                    onChange={(e) => setBusinessHoursStart(e.target.value)}
                    className="bg-card border-border"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="businessEnd" className="text-xs text-muted-foreground">Business Hours End</Label>
                  <Input
                    id="businessEnd"
                    type="time"
                    value={businessHoursEnd}
                    onChange={(e) => setBusinessHoursEnd(e.target.value)}
                    className="bg-card border-border"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="maxDuration" className="text-xs text-muted-foreground">Max Call Duration (minutes)</Label>
                <Select value={maxCallDuration} onValueChange={setMaxCallDuration}>
                  <SelectTrigger className="bg-card border-border">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="15">15 minutes</SelectItem>
                    <SelectItem value="30">30 minutes</SelectItem>
                    <SelectItem value="45">45 minutes</SelectItem>
                    <SelectItem value="60">60 minutes</SelectItem>
                    <SelectItem value="unlimited">Unlimited</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-between pt-2">
                <div>
                  <p className="text-sm font-medium text-card-foreground">After Hours Message</p>
                  <p className="text-xs text-muted-foreground">Play a message outside business hours</p>
                </div>
                <Switch checked={afterHoursMessage} onCheckedChange={setAfterHoursMessage} />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-card-foreground">Call Recording</p>
                  <p className="text-xs text-muted-foreground">Record calls for quality assurance</p>
                </div>
                <Switch checked={callRecording} onCheckedChange={setCallRecording} />
              </div>
            </CardContent>
          </Card>

          {/* Scheduled Reports */}
          <Card className="border-border col-span-2">
            <CardHeader className="pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-[#6b7a4a]/10 flex items-center justify-center">
                  <FileText className="w-5 h-5 text-[#6b7a4a]" />
                </div>
                <div>
                  <CardTitle className="text-base">Scheduled Reports</CardTitle>
                  <CardDescription className="text-xs">Configure which reports to receive via email and manage subscribers</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Delivery Settings */}
              <div className="grid grid-cols-3 gap-4 pb-4 border-b border-border">
                <div className="space-y-2">
                  <Label htmlFor="dailyTime" className="text-xs text-muted-foreground">Daily Delivery Time</Label>
                  <Input
                    id="dailyTime"
                    type="time"
                    value={dailyDeliveryTime}
                    onChange={(e) => setDailyDeliveryTime(e.target.value)}
                    className="bg-card border-border"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="weeklyDay" className="text-xs text-muted-foreground">Weekly Delivery Day</Label>
                  <select
                    id="weeklyDay"
                    value={weeklyDeliveryDay}
                    onChange={(e) => setWeeklyDeliveryDay(e.target.value)}
                    className="flex h-9 w-full rounded-md border border-border bg-card px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    <option value="monday">Monday</option>
                    <option value="tuesday">Tuesday</option>
                    <option value="wednesday">Wednesday</option>
                    <option value="thursday">Thursday</option>
                    <option value="friday">Friday</option>
                    <option value="saturday">Saturday</option>
                    <option value="sunday">Sunday</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="digestFormat" className="text-xs text-muted-foreground">Report Format</Label>
                  <select
                    id="digestFormat"
                    value={digestFormat}
                    onChange={(e) => setDigestFormat(e.target.value)}
                    className="flex h-9 w-full rounded-md border border-border bg-card px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    <option value="summary">Summary</option>
                    <option value="detailed">Detailed</option>
                    <option value="pdf">PDF Attachment</option>
                  </select>
                </div>
              </div>

              {/* Report Subscriptions */}
              <div className="space-y-3">
                <p className="text-sm font-medium text-card-foreground">Report Subscriptions</p>
                
                {availableReports.map((report) => {
                  const counts = getSubscriberCounts(report.id)
                  return (
                    <div key={report.id} className="border border-border rounded-lg bg-background">
                      <button
                        onClick={() => setExpandedReport(expandedReport === report.id ? null : report.id)}
                        className="w-full p-4 flex items-center justify-between text-left"
                      >
                        <div className="flex-1">
                          <p className="text-sm font-medium text-card-foreground">{report.name}</p>
                          <p className="text-xs text-muted-foreground">{report.description}</p>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="flex items-center gap-3 text-xs">
                            <span className="text-muted-foreground">
                              <span className="font-medium text-card-foreground">{counts.daily}</span> daily
                            </span>
                            <span className="text-muted-foreground">
                              <span className="font-medium text-card-foreground">{counts.weekly}</span> weekly
                            </span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Users className="w-4 h-4 text-muted-foreground" />
                            <span className="text-sm text-muted-foreground">{counts.total}</span>
                            {expandedReport === report.id ? (
                              <ChevronUp className="w-4 h-4 text-muted-foreground ml-1" />
                            ) : (
                              <ChevronDown className="w-4 h-4 text-muted-foreground ml-1" />
                            )}
                          </div>
                        </div>
                      </button>
                      
                      {/* Expanded subscriber list with individual controls */}
                      {expandedReport === report.id && (
                        <div className="px-4 pb-4 border-t border-border">
                          <div className="pt-3 space-y-2">
                            {/* Header row */}
                            <div className="flex items-center gap-2 text-xs text-muted-foreground pb-2">
                              <div className="flex-1">Subscriber</div>
                              <div className="w-16 text-center">Daily</div>
                              <div className="w-16 text-center">Weekly</div>
                              <div className="w-8"></div>
                            </div>
                            
                            {/* Subscriber rows */}
                            {reportSubscriptions[report.id]?.map((subscriber) => (
                              <div key={subscriber.email} className="flex items-center gap-2 py-2 border-b border-border/50 last:border-0">
                                <div className="flex-1 flex items-center gap-2">
                                  <Mail className="w-3 h-3 text-muted-foreground" />
                                  <span className="text-sm">{subscriber.email}</span>
                                </div>
                                <div className="w-16 flex justify-center">
                                  <Switch
                                    checked={subscriber.daily}
                                    onCheckedChange={() => toggleSubscriberSchedule(report.id, subscriber.email, "daily")}
                                  />
                                </div>
                                <div className="w-16 flex justify-center">
                                  <Switch
                                    checked={subscriber.weekly}
                                    onCheckedChange={() => toggleSubscriberSchedule(report.id, subscriber.email, "weekly")}
                                  />
                                </div>
                                <div className="w-8 flex justify-center">
                                  <button
                                    onClick={() => removeSubscriber(report.id, subscriber.email)}
                                    className="text-muted-foreground hover:text-destructive"
                                  >
                                    <X className="w-4 h-4" />
                                  </button>
                                </div>
                              </div>
                            ))}
                            
                            {reportSubscriptions[report.id]?.length === 0 && (
                              <p className="text-xs text-muted-foreground py-2">No subscribers yet</p>
                            )}
                            
                            {/* Add subscriber row */}
                            <div className="flex gap-2 pt-2">
                              <Input
                                type="email"
                                value={newSubscriberEmail}
                                onChange={(e) => setNewSubscriberEmail(e.target.value)}
                                className="bg-card border-border flex-1 text-sm h-8"
                                placeholder="Add subscriber email"
                                onKeyDown={(e) => e.key === "Enter" && addSubscriber(report.id)}
                              />
                              <Button 
                                variant="outline" 
                                size="sm" 
                                onClick={() => addSubscriber(report.id)} 
                                className="border-border h-8"
                              >
                                <Plus className="w-3 h-3 mr-1" />
                                Add
                              </Button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  )
}
