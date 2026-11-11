Attribute VB_Name = "WorkBrokerDisparo"
' WorkBroker · Envio automático dos relatórios mensais pelo Outlook
' Uso: Alt+F8 > EnviarRelatorios > Executar. Escolha a pasta do pacote baixado no site (onde está o lista.txt).
' Os e-mails saem da sua conta, ficam nos seus Itens Enviados e o envio pode ser retomado se for interrompido.
Option Explicit

Private Const PAUSA_SEGUNDOS As Long = 4   ' intervalo entre e-mails (evita bloqueio do servidor por envio em massa)

Public Sub EnviarRelatorios()
    Dim pasta As String, linhas() As String, i As Long, c() As String
    Dim total As Long, feitos As Long, pulados As Long, erros As String, nErros As Long
    Dim modo As String, conta As Object, enviados As String, m As Object, meuEmail As String

    pasta = EscolherPasta()
    If pasta = "" Then Exit Sub
    If Right(pasta, 1) <> "\" Then pasta = pasta & "\"
    If Dir(pasta & "lista.txt") = "" Then
        MsgBox "Não encontrei o arquivo lista.txt nesta pasta." & vbCrLf & vbCrLf & _
               "Extraia o .zip baixado no WorkBroker e escolha a pasta extraída.", vbExclamation, "WorkBroker"
        Exit Sub
    End If

    linhas = Split(Replace(LerUtf8(pasta & "lista.txt"), vbCr, ""), vbLf)
    For i = 1 To UBound(linhas)
        If Trim(linhas(i)) <> "" Then total = total + 1
    Next i
    If total = 0 Then MsgBox "A lista está vazia.", vbExclamation, "WorkBroker": Exit Sub

    Set conta = EscolherConta()
    If conta Is Nothing Then
        meuEmail = Application.Session.Accounts.Item(1).SmtpAddress
    Else
        meuEmail = conta.SmtpAddress
    End If

    If Dir(pasta & "enviados.txt") <> "" Then enviados = LerUtf8(pasta & "enviados.txt")

    modo = InputBox("Encontrei " & total & " e-mail(s) para enviar de " & meuEmail & "." & vbCrLf & vbCrLf & _
        "1 = TESTE: manda só o primeiro e-mail para você (" & meuEmail & ")" & vbCrLf & _
        "2 = RASCUNHOS: cria todos na pasta Rascunhos, sem enviar" & vbCrLf & _
        "3 = ENVIAR TODOS para os clientes agora" & vbCrLf & vbCrLf & "Digite 1, 2 ou 3:", "WorkBroker · Envio dos relatórios", "1")
    If modo <> "1" And modo <> "2" And modo <> "3" Then Exit Sub

    If modo = "3" Then
        If MsgBox("Enviar " & total & " e-mail(s) para os clientes agora?" & vbCrLf & vbCrLf & _
                  "Leva cerca de " & Int(total * PAUSA_SEGUNDOS / 60) + 1 & " minuto(s). Não feche o Outlook durante o envio." & vbCrLf & _
                  "Clientes que já constam no enviados.txt desta pasta são pulados.", _
                  vbYesNo + vbQuestion, "WorkBroker") <> vbYes Then Exit Sub
    End If

    For i = 1 To UBound(linhas)
        If Trim(linhas(i)) = "" Then GoTo proximo
        c = Split(linhas(i), vbTab)   ' 0 código | 1 nome | 2 e-mail | 3 assunto | 4 html | 5 pdf
        If UBound(c) < 5 Then GoTo proximo
        If modo = "3" And InStr(1, enviados, "|" & c(0) & "|") > 0 Then pulados = pulados + 1: GoTo proximo

        On Error Resume Next
        Err.Clear
        Set m = Application.CreateItem(0)
        If Not conta Is Nothing Then Set m.SendUsingAccount = conta
        If modo = "1" Then
            m.To = meuEmail
            m.Subject = "[TESTE] " & c(3)
        Else
            m.To = c(2)
            m.Subject = c(3)
        End If
        m.HTMLBody = LerUtf8(pasta & Replace(c(4), "/", "\"))
        If c(5) <> "" Then m.Attachments.Add pasta & Replace(c(5), "/", "\")
        If Err.Number = 0 Then
            If modo = "2" Then m.Save Else m.Send
        End If
        If Err.Number <> 0 Then
            nErros = nErros + 1
            erros = erros & c(0) & " " & c(1) & " <" & c(2) & ">: " & Err.Description & vbCrLf
            On Error GoTo 0
        Else
            On Error GoTo 0
            feitos = feitos + 1
            If modo = "3" Then AnotarEnviado pasta, c(0) & vbTab & c(2) & vbTab & Format(Now, "dd/mm/yyyy hh:nn:ss")
        End If
        Set m = Nothing

        If modo = "1" Then Exit For
        If modo = "3" Then Esperar PAUSA_SEGUNDOS
proximo:
    Next i

    If nErros > 0 Then GravarTexto pasta & "erros.txt", erros
    Select Case modo
        Case "1": MsgBox IIf(feitos = 1, "Teste enviado para " & meuEmail & ". Confira na sua caixa de entrada e rode de novo com a opção 3.", "O teste falhou:" & vbCrLf & erros), vbInformation, "WorkBroker"
        Case "2": MsgBox feitos & " rascunho(s) criado(s) na pasta Rascunhos." & IIf(nErros > 0, vbCrLf & nErros & " com erro (veja erros.txt na pasta).", ""), vbInformation, "WorkBroker"
        Case "3": MsgBox "Pronto! " & feitos & " e-mail(s) enviado(s)." & _
                    IIf(pulados > 0, vbCrLf & pulados & " já tinham sido enviados antes e foram pulados.", "") & _
                    IIf(nErros > 0, vbCrLf & nErros & " com erro (veja erros.txt na pasta).", "") & vbCrLf & vbCrLf & _
                    "A lista do que saiu fica no enviados.txt da pasta.", vbInformation, "WorkBroker"
    End Select
End Sub

Private Function EscolherPasta() As String
    Dim f As Object
    Set f = CreateObject("Shell.Application").BrowseForFolder(0, "Escolha a pasta extraída do pacote do WorkBroker (onde está o lista.txt)", 0)
    If Not f Is Nothing Then EscolherPasta = f.Self.Path
End Function

Private Function EscolherConta() As Object
    Dim contas As Object, i As Long, txt As String, r As String
    Set contas = Application.Session.Accounts
    If contas.Count <= 1 Then Exit Function
    For i = 1 To contas.Count
        txt = txt & i & " = " & contas.Item(i).SmtpAddress & vbCrLf
    Next i
    r = InputBox("De qual conta os e-mails devem sair?" & vbCrLf & vbCrLf & txt, "WorkBroker · Conta de envio", "1")
    If IsNumeric(r) Then
        If CLng(r) >= 1 And CLng(r) <= contas.Count Then Set EscolherConta = contas.Item(CLng(r))
    End If
End Function

Private Function LerUtf8(caminho As String) As String
    Dim st As Object
    Set st = CreateObject("ADODB.Stream")
    st.Type = 2
    st.Charset = "utf-8"
    st.Open
    st.LoadFromFile caminho
    LerUtf8 = st.ReadText(-1)
    st.Close
End Function

Private Sub GravarTexto(caminho As String, txt As String)
    Dim n As Integer
    n = FreeFile
    Open caminho For Output As #n
    Print #n, txt
    Close #n
End Sub

Private Sub AnotarEnviado(pasta As String, linha As String)
    Dim n As Integer, cod As String
    cod = Split(linha, vbTab)(0)
    n = FreeFile
    Open pasta & "enviados.txt" For Append As #n
    Print #n, "|" & cod & "|" & vbTab & linha
    Close #n
End Sub

Private Sub Esperar(segundos As Long)
    Dim fim As Single
    fim = Timer + segundos
    Do While Timer < fim
        DoEvents
        If Timer < 1 Then Exit Do   ' virada da meia-noite
    Loop
End Sub
